/**
 * Chain Trade Service
 * Manages the lifecycle of multi-party chain trades
 * 
 * Lifecycle:
 * 1. PROPOSED - Chain detected and sent to all participants
 * 2. PENDING_ACCEPTANCE - Waiting for all users to accept
 * 3. LOCKED - All accepted, items locked, awaiting escrow funding
 * 4. ESCROW_FUNDED - All cash obligations funded
 * 5. SHIPPING - Participants shipping items
 * 6. COMPLETED - All items received and verified
 * 7. FAILED - Chain broke (someone rejected/didn't ship)
 */

import { db } from './database';
import { ChainCycle, findChainsForUser, findValidChains } from './chainMatchService';
import { createNotification, NotificationType } from './notifications/notificationService';
import crypto from 'crypto';

// Platform fee - everyone pays $15 as "skin in the game"
const CHAIN_PLATFORM_FEE_CENTS = 1500; // $15.00

// ============================================
// Types
// ============================================

export enum ChainStatus {
    PROPOSED = 'PROPOSED',
    PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
    LOCKED = 'LOCKED',
    ESCROW_FUNDED = 'ESCROW_FUNDED',
    SHIPPING = 'SHIPPING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    EXPIRED = 'EXPIRED',
}

export interface ChainProposal {
    id: string;
    status: ChainStatus;
    totalValueCents: number;
    valueTolerancePercent: number;
    maxParticipants: number;
    createdAt: string;
    updatedAt: string;
    expiresAt: string | null;
    executedAt: string | null;
    failedReason: string | null;
    participants: ChainParticipant[];
}

export interface ChainParticipant {
    id: number;
    chainId: string;
    userId: number;
    userName?: string;
    givesItemId: number;
    givesItemName?: string;
    receivesItemId: number;
    receivesItemName?: string;
    givesToUserId: number;
    receivesFromUserId: number;
    cashDelta: number;
    platformFeeCents: number; // $15 per participant
    totalOwed: number; // cashDelta + platformFeeCents
    hasAccepted: boolean;
    hasFunded: boolean;
    hasShipped: boolean;
    trackingNumber: string | null;
    carrier: string | null;
    hasReceived: boolean;
    acceptedAt: string | null;
    shippedAt: string | null;
    receivedAt: string | null;
}

// ============================================
// Database Helpers
// ============================================

function dbAll<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve((rows || []) as T[]);
        });
    });
}

function dbGet<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row as T | undefined);
        });
    });
}

function dbRun(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// ============================================
// Chain Proposal Creation
// ============================================

/**
 * Create a chain proposal from a detected cycle
 */
export async function createChainProposal(cycle: ChainCycle): Promise<ChainProposal> {
    const chainId = `chain_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hour expiry

    // Insert the proposal
    await dbRun(`
    INSERT INTO chain_proposals (id, status, total_value_cents, value_tolerance_percent, max_participants, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [chainId, ChainStatus.PROPOSED, cycle.totalValueCents, 15, cycle.participantIds.length, now, now, expiresAt]);

    // Insert participants
    for (let i = 0; i < cycle.edges.length; i++) {
        const edge = cycle.edges[i];
        const nextEdge = cycle.edges[(i + 1) % cycle.edges.length];
        const prevEdge = cycle.edges[(i - 1 + cycle.edges.length) % cycle.edges.length];
        const cashDelta = cycle.cashBalances.get(edge.fromUserId) || 0;

        await dbRun(`
      INSERT INTO chain_participants (chain_id, user_id, gives_item_id, receives_item_id, gives_to_user_id, receives_from_user_id, cash_delta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [chainId, edge.fromUserId, edge.itemId, prevEdge.itemId, edge.toUserId, prevEdge.fromUserId, cashDelta]);
    }

    // Notify all participants
    for (const userId of cycle.participantIds) {
        try {
            await createNotification(
                userId,
                NotificationType.CHAIN_TRADE_OPPORTUNITY,
                '🔗 Chain Trade Opportunity!',
                `A ${cycle.participantIds.length}-way trade has been found! You give and receive items in a closed loop.`,
                null
            );
        } catch (e) {
            console.error(`[ChainTrade] Failed to notify user ${userId}:`, e);
        }
    }

    return getChainProposal(chainId) as Promise<ChainProposal>;
}

/**
 * Scan for chains and create proposals for a specific user
 */
export async function scanAndPropose(userId: number): Promise<ChainProposal[]> {
    const chains = await findChainsForUser(userId);
    const proposals: ChainProposal[] = [];

    for (const cycle of chains) {
        // Check if a similar proposal already exists (same participants)
        const key = [...cycle.participantIds].sort((a, b) => a - b).join(',');
        const existing = await dbGet<{ id: string }>(`
      SELECT cp.id FROM chain_proposals cp
      WHERE cp.status NOT IN ('FAILED', 'EXPIRED', 'COMPLETED')
      AND EXISTS (
        SELECT 1 FROM chain_participants p 
        WHERE p.chain_id = cp.id 
        GROUP BY p.chain_id 
        HAVING GROUP_CONCAT(p.user_id ORDER BY p.user_id) = ?
      )
    `, [key]);

        if (!existing) {
            const proposal = await createChainProposal(cycle);
            proposals.push(proposal);
        }
    }

    return proposals;
}

// ============================================
// Chain Retrieval
// ============================================

/**
 * Get a chain proposal by ID with all participants
 */
export async function getChainProposal(chainId: string): Promise<ChainProposal | null> {
    const proposal = await dbGet<any>(`
    SELECT * FROM chain_proposals WHERE id = ?
  `, [chainId]);

    if (!proposal) return null;

    const participantRows = await dbAll<any>(`
    SELECT 
      cp.*,
      u.name as user_name,
      gi.name as gives_item_name,
      ri.name as receives_item_name
    FROM chain_participants cp
    JOIN User u ON cp.user_id = u.id
    JOIN Item gi ON cp.gives_item_id = gi.id
    JOIN Item ri ON cp.receives_item_id = ri.id
    WHERE cp.chain_id = ?
    ORDER BY cp.id
  `, [chainId]);

    const participants: ChainParticipant[] = participantRows.map(row => {
        const cashDelta = row.cash_delta || 0;
        const platformFeeCents = CHAIN_PLATFORM_FEE_CENTS;
        const totalOwed = Math.max(0, cashDelta) + platformFeeCents; // Fee + any cash owed
        return {
            id: row.id,
            chainId: row.chain_id,
            userId: row.user_id,
            userName: row.user_name,
            givesItemId: row.gives_item_id,
            givesItemName: row.gives_item_name,
            receivesItemId: row.receives_item_id,
            receivesItemName: row.receives_item_name,
            givesToUserId: row.gives_to_user_id,
            receivesFromUserId: row.receives_from_user_id,
            cashDelta: cashDelta,
            platformFeeCents: platformFeeCents,
            totalOwed: totalOwed,
            hasAccepted: !!row.has_accepted,
            hasFunded: !!row.has_funded,
            hasShipped: !!row.has_shipped,
            trackingNumber: row.tracking_number,
            carrier: row.carrier,
            hasReceived: !!row.has_received,
            acceptedAt: row.accepted_at,
            shippedAt: row.shipped_at,
            receivedAt: row.received_at,
        };
    });

    return {
        id: proposal.id,
        status: proposal.status as ChainStatus,
        totalValueCents: proposal.total_value_cents,
        valueTolerancePercent: proposal.value_tolerance_percent,
        maxParticipants: proposal.max_participants,
        createdAt: proposal.created_at,
        updatedAt: proposal.updated_at,
        expiresAt: proposal.expires_at,
        executedAt: proposal.executed_at,
        failedReason: proposal.failed_reason,
        participants,
    };
}

/**
 * Get all chain proposals for a user
 */
export async function getChainProposalsForUser(userId: number): Promise<ChainProposal[]> {
    const chainIds = await dbAll<{ chain_id: string }>(`
    SELECT DISTINCT chain_id FROM chain_participants WHERE user_id = ?
  `, [userId]);

    const proposals: ChainProposal[] = [];
    for (const row of chainIds) {
        const proposal = await getChainProposal(row.chain_id);
        if (proposal && !['FAILED', 'EXPIRED'].includes(proposal.status)) {
            proposals.push(proposal);
        }
    }

    return proposals;
}

// ============================================
// Chain Actions
// ============================================

/**
 * Accept a chain proposal
 */
export async function acceptChainProposal(chainId: string, userId: number): Promise<ChainProposal> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    if (proposal.status === ChainStatus.FAILED || proposal.status === ChainStatus.EXPIRED) {
        throw new Error(`Chain is ${proposal.status}`);
    }

    if (participant.hasAccepted) {
        throw new Error('User has already accepted');
    }

    // Mark user as accepted
    await dbRun(`
    UPDATE chain_participants 
    SET has_accepted = 1, accepted_at = datetime('now')
    WHERE chain_id = ? AND user_id = ?
  `, [chainId, userId]);

    // Check if all participants have accepted
    const allAccepted = await dbGet<{ count: number }>(`
    SELECT COUNT(*) as count FROM chain_participants 
    WHERE chain_id = ? AND has_accepted = 0
  `, [chainId]);

    if (allAccepted?.count === 0) {
        // All accepted - move to LOCKED and lock items
        await dbRun(`
      UPDATE chain_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?
    `, [ChainStatus.LOCKED, chainId]);

        // Lock all items
        for (const p of proposal.participants) {
            await dbRun(`UPDATE Item SET status = 'locked' WHERE id = ?`, [p.givesItemId]);
        }

        // Notify everyone that chain is locked
        for (const p of proposal.participants) {
            await createNotification(
                p.userId,
                NotificationType.CHAIN_TRADE_LOCKED,
                '🔒 Chain Trade Locked!',
                'All participants accepted! Items are now locked. Please fund your escrow obligation.',
                null
            );
        }
    } else {
        // Update status to PENDING_ACCEPTANCE if still PROPOSED
        if (proposal.status === ChainStatus.PROPOSED) {
            await dbRun(`
        UPDATE chain_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?
      `, [ChainStatus.PENDING_ACCEPTANCE, chainId]);
        }
    }

    return getChainProposal(chainId) as Promise<ChainProposal>;
}

/**
 * Reject a chain proposal (cancels the entire chain)
 */
export async function rejectChainProposal(chainId: string, userId: number, reason?: string): Promise<ChainProposal> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    if (proposal.status === ChainStatus.COMPLETED) {
        throw new Error('Cannot reject a completed chain');
    }

    // Fail the chain
    await dbRun(`
    UPDATE chain_proposals 
    SET status = ?, failed_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `, [ChainStatus.FAILED, reason || `Rejected by user ${userId}`, chainId]);

    // Unlock all items
    for (const p of proposal.participants) {
        await dbRun(`UPDATE Item SET status = 'active' WHERE id = ?`, [p.givesItemId]);
    }

    // TODO: Refund any escrow holds

    // Notify all participants
    for (const p of proposal.participants) {
        if (p.userId !== userId) {
            await createNotification(
                p.userId,
                NotificationType.CHAIN_TRADE_CANCELLED,
                '❌ Chain Trade Cancelled',
                'A participant declined. The chain trade has been cancelled and items unlocked.',
                null
            );
        }
    }

    return getChainProposal(chainId) as Promise<ChainProposal>;
}

/**
 * Fund escrow for a chain (for users who owe cash)
 */
export async function fundChainEscrow(chainId: string, userId: number): Promise<ChainProposal> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    if (proposal.status !== ChainStatus.LOCKED) {
        throw new Error('Chain must be in LOCKED status to fund escrow');
    }

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    if (participant.hasFunded) {
        throw new Error('User has already funded escrow');
    }

    // EVERYONE pays $15 platform fee + any cash they owe
    // This is the "Chain Breaker" logic - skin in the game for all participants
    const holdId = `hold_${crypto.randomUUID()}`;
    const amountToCollect = participant.totalOwed; // platformFeeCents + max(0, cashDelta)

    console.log(`[ChainTrade] User ${userId} funding escrow: $${(amountToCollect / 100).toFixed(2)} (fee: $${(participant.platformFeeCents / 100).toFixed(2)}, cash balance: $${(Math.max(0, participant.cashDelta) / 100).toFixed(2)})`);

    // Create escrow hold for fee + any cash obligation
    await dbRun(`
      INSERT INTO escrow_holds (id, trade_id, payer_id, recipient_id, amount, status, provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'HELD', 'mock', datetime('now'), datetime('now'))
    `, [holdId, chainId, userId, 0, amountToCollect]); // recipient 0 = platform pool

    await dbRun(`
      UPDATE chain_participants SET has_funded = 1 WHERE chain_id = ? AND user_id = ?
    `, [chainId, userId]);

    // Check if all participants have funded
    const allFunded = await dbGet<{ count: number }>(`
    SELECT COUNT(*) as count FROM chain_participants 
    WHERE chain_id = ? AND has_funded = 0
  `, [chainId]);

    if (allFunded?.count === 0) {
        // All funded - move to ESCROW_FUNDED then SHIPPING
        await dbRun(`
      UPDATE chain_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?
    `, [ChainStatus.SHIPPING, chainId]);

        // Notify everyone to ship
        for (const p of proposal.participants) {
            await createNotification(
                p.userId,
                NotificationType.CHAIN_TRADE_SHIPPING,
                '📦 Time to Ship!',
                `Escrow funded! Please ship your item to complete the chain trade.`,
                null
            );
        }
    }

    return getChainProposal(chainId) as Promise<ChainProposal>;
}

/**
 * Submit shipping for a chain leg
 */
export async function submitChainShipping(
    chainId: string,
    userId: number,
    trackingNumber: string,
    carrier: string
): Promise<ChainProposal> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    if (proposal.status !== ChainStatus.SHIPPING) {
        throw new Error('Chain must be in SHIPPING status');
    }

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    await dbRun(`
    UPDATE chain_participants 
    SET has_shipped = 1, tracking_number = ?, carrier = ?, shipped_at = datetime('now')
    WHERE chain_id = ? AND user_id = ?
  `, [trackingNumber, carrier, chainId, userId]);

    // Notify the recipient
    await createNotification(
        participant.givesToUserId,
        NotificationType.TRACKING_ADDED,
        '📬 Item Shipped!',
        `Your item is on its way! Tracking: ${trackingNumber}`,
        null
    );

    return getChainProposal(chainId) as Promise<ChainProposal>;
}

/**
 * Verify receipt for a chain leg
 */
export async function verifyChainReceipt(chainId: string, userId: number): Promise<ChainProposal> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    if (proposal.status !== ChainStatus.SHIPPING) {
        throw new Error('Chain must be in SHIPPING status');
    }

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    await dbRun(`
    UPDATE chain_participants 
    SET has_received = 1, received_at = datetime('now')
    WHERE chain_id = ? AND user_id = ?
  `, [chainId, userId]);

    // Check if all participants have received
    const allReceived = await dbGet<{ count: number }>(`
    SELECT COUNT(*) as count FROM chain_participants 
    WHERE chain_id = ? AND has_received = 0
  `, [chainId]);

    if (allReceived?.count === 0) {
        // All received - chain complete!
        await dbRun(`
      UPDATE chain_proposals 
      SET status = ?, executed_at = datetime('now'), updated_at = datetime('now') 
      WHERE id = ?
    `, [ChainStatus.COMPLETED, chainId]);

        // Release escrow, transfer items
        for (const p of proposal.participants) {
            // Transfer item ownership
            await dbRun(`UPDATE Item SET owner_id = ?, status = 'active' WHERE id = ?`, [
                p.receivesFromUserId === p.userId ? p.userId : proposal.participants.find(pp => pp.givesToUserId === p.userId)?.userId,
                p.givesItemId
            ]);
        }

        // Update item ownership correctly
        for (const p of proposal.participants) {
            // The item they receive was given by receivesFromUserId
            const giver = proposal.participants.find(pp => pp.userId === p.receivesFromUserId);
            if (giver) {
                await dbRun(`UPDATE Item SET owner_id = ? WHERE id = ?`, [p.userId, giver.givesItemId]);
            }
        }

        // Notify everyone
        for (const p of proposal.participants) {
            await createNotification(
                p.userId,
                NotificationType.TRADE_COMPLETED,
                '🎉 Chain Trade Complete!',
                'Congratulations! The chain trade has been completed successfully.',
                null
            );
        }
    }

    return getChainProposal(chainId) as Promise<ChainProposal>;
}
