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
import { stripePaymentProvider } from './payments/stripeProvider';
import { calculateTradeFee, incrementTradeCounter } from './feeService';
import { createTrackingRecord, detectCarrier } from './shippingService';
import crypto from 'crypto';

// Platform fee - everyone pays $15 as "skin in the game" (unless Pro waived)
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

/**
 * P2 FIX: Generate a hash for a chain cycle to prevent re-proposing rejected chains
 * Hash is based on sorted participant IDs and item IDs to be order-independent
 * MUST match the format in chainMatchService.ts to work correctly!
 */
function generateCycleHash(proposal: ChainProposal): string {
    // Sort participants to make hash order-independent
    // Format MUST match chainMatchService.ts: ${userId}:${givesItemId}
    const participantData = proposal.participants
        .map(p => `${p.userId}:${p.givesItemId}`)
        .sort()
        .join('|');

    // Create a simple hash (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < participantData.length; i++) {
        const char = participantData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `cycle_${Math.abs(hash).toString(16)}`;
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
        // All accepted - move to LOCKED and lock items with OPTIMISTIC LOCKING
        // P0 FIX: Prevent "Double-Spend" race condition by checking status = 'active'
        const lockedItems: number[] = [];

        try {
            for (const p of proposal.participants) {
                // Only lock if item is still 'active' (not already locked by another trade)
                const result = await dbRun(
                    `UPDATE Item SET status = 'locked' WHERE id = ? AND status = 'active'`,
                    [p.givesItemId]
                );

                // Check if update affected any rows (SQLite returns changes count)
                const changes = await dbGet<{ changes: number }>(
                    `SELECT changes() as changes`
                );

                if (!changes || changes.changes === 0) {
                    // Item was already locked - rollback and fail the chain
                    throw new Error(`Item ${p.givesItemId} already locked by another trade`);
                }

                lockedItems.push(p.givesItemId);
            }

            // All items successfully locked - update chain status
            await dbRun(`
              UPDATE chain_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?
            `, [ChainStatus.LOCKED, chainId]);

        } catch (lockError: any) {
            // Rollback: unlock any items we managed to lock
            console.error(`[ChainTrade] Lock conflict for chain ${chainId}: ${lockError.message}`);
            for (const itemId of lockedItems) {
                await dbRun(`UPDATE Item SET status = 'active' WHERE id = ?`, [itemId]);
            }

            // Fail the chain proposal
            await dbRun(`
              UPDATE chain_proposals SET status = ?, failed_reason = ?, updated_at = datetime('now') WHERE id = ?
            `, [ChainStatus.FAILED, `Race condition: ${lockError.message}`, chainId]);

            throw new Error(`Chain could not be locked: ${lockError.message}`);
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
 * P2 FIX: Records rejection to prevent zombie chains from being re-proposed
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

    // P2 FIX: Record this cycle hash to prevent re-proposing (30-day cooldown)
    const cycleHash = generateCycleHash(proposal);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    try {
        await dbRun(`
          INSERT OR REPLACE INTO rejected_chains (cycle_hash, rejected_by_user_id, original_chain_id, rejected_at, expires_at, reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [cycleHash, userId, chainId, now.toISOString(), expiresAt.toISOString(), reason || 'User rejection']);

        console.log(`[ChainTrade] Recorded rejection for cycle ${cycleHash} by user ${userId}, expires ${expiresAt.toISOString()}`);
    } catch (e) {
        console.warn(`[ChainTrade] Could not record rejection (table may not exist yet):`, e);
    }

    // Unlock all items
    for (const p of proposal.participants) {
        await dbRun(`UPDATE Item SET status = 'active' WHERE id = ?`, [p.givesItemId]);
    }

    // Refund all escrow holds for this chain
    await refundChainEscrows(chainId);

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

    // Check if user qualifies for Pro waiver (Task 1.1b)
    const feeResult = await calculateTradeFee(userId);
    const feeComponent = feeResult.isWaived ? 0 : CHAIN_PLATFORM_FEE_CENTS;
    const cashComponent = Math.max(0, participant.cashDelta);
    const amountToCollect = cashComponent + feeComponent;

    console.log(`[ChainTrade] User ${userId} funding escrow: $${(amountToCollect / 100).toFixed(2)} (fee: $${(feeComponent / 100).toFixed(2)}${feeResult.isWaived ? ' WAIVED' : ''}, cash: $${(cashComponent / 100).toFixed(2)})`);

    // If Pro user gets waiver but still has cash to pay
    if (feeResult.isWaived && amountToCollect > 0) {
        console.log(`[ChainTrade] Pro waiver applied for user ${userId}. Reason: ${feeResult.reason}`);
    }

    // Create Stripe PaymentIntent (only if there's money to collect)
    let paymentIntentId: string | null = null;
    if (amountToCollect > 0) {
        const paymentIntent = await stripePaymentProvider.createPaymentIntent(
            cashComponent,
            'usd',
            chainId,
            userId,
            { chainTrade: 'true', participantId: String(participant.id), feeWaived: String(feeResult.isWaived) },
            feeComponent
        );
        paymentIntentId = paymentIntent.providerReference;

        // Store escrow hold with Stripe provider reference
        const holdId = `hold_${crypto.randomUUID()}`;
        await dbRun(`
          INSERT INTO escrow_holds (id, trade_id, payer_id, recipient_id, amount, status, provider, provider_reference, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'PENDING', 'stripe', ?, datetime('now'), datetime('now'))
        `, [holdId, chainId, userId, 0, amountToCollect, paymentIntentId]);

        console.log(`[ChainTrade] Created Stripe PaymentIntent ${paymentIntent.id} for chain ${chainId}, user ${userId}`);
    } else {
        console.log(`[ChainTrade] User ${userId} has nothing to pay (Pro waiver + no cash delta)`);
    }

    // Increment trade counter if waiver was used
    if (feeResult.isWaived) {
        await incrementTradeCounter(userId);
    }

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
 * Submit shipping for a chain leg (with "Green Light" logic - Task 3.2)
 * All participants must submit tracking before the chain progresses
 */
export async function submitChainShipping(
    chainId: string,
    userId: number,
    trackingNumber: string,
    carrier: string,
    shippingPhotoUrl?: string
): Promise<ChainProposal & { greenLight: boolean }> {
    const proposal = await getChainProposal(chainId);
    if (!proposal) throw new Error('Chain proposal not found');

    // Allow shipping during both ESCROW_FUNDED and SHIPPING status
    if (proposal.status !== ChainStatus.ESCROW_FUNDED && proposal.status !== ChainStatus.SHIPPING) {
        throw new Error('Chain must be in ESCROW_FUNDED or SHIPPING status to submit shipping');
    }

    const participant = proposal.participants.find(p => p.userId === userId);
    if (!participant) throw new Error('User is not a participant in this chain');

    if (participant.hasShipped) {
        throw new Error('User has already submitted shipping');
    }

    // P1 FIX: Data Schism - Use centralized shipment_tracking table for carrier API polling
    // This ensures chain trades get auto-updated like direct trades
    const detectedCarrier = carrier || detectCarrier(trackingNumber);
    await createTrackingRecord(chainId, userId, trackingNumber);

    // Update chain_participants flag for Green Light logic (keep tracking number for reference)
    await dbRun(`
    UPDATE chain_participants 
    SET has_shipped = 1, tracking_number = ?, carrier = ?, shipped_at = datetime('now')${shippingPhotoUrl ? ', shipping_photo_url = ?' : ''}
    WHERE chain_id = ? AND user_id = ?
  `, shippingPhotoUrl
        ? [trackingNumber, detectedCarrier, shippingPhotoUrl, chainId, userId]
        : [trackingNumber, detectedCarrier, chainId, userId]);

    // Check if ALL participants have now submitted tracking ("Green Light" logic)
    const pendingShipments = await dbGet<{ count: number }>(`
    SELECT COUNT(*) as count FROM chain_participants 
    WHERE chain_id = ? AND has_shipped = 0
  `, [chainId]);

    const allShipped = pendingShipments?.count === 0;

    if (allShipped) {
        // GREEN LIGHT: Everyone has tracking! Move to SHIPPING status
        await dbRun(`
          UPDATE chain_proposals SET status = ?, updated_at = datetime('now') WHERE id = ?
        `, [ChainStatus.SHIPPING, chainId]);

        // Notify all participants: "Green Light - Drop off your packages now!"
        for (const p of proposal.participants) {
            await createNotification(
                p.userId,
                NotificationType.CHAIN_TRADE_SHIPPING,
                '🟢 Green Light: Ship Now!',
                `All ${proposal.participants.length} participants have tracking. Drop off your packages now!`,
                null
            );
        }

        console.log(`[ChainTrade] GREEN LIGHT for chain ${chainId} - all ${proposal.participants.length} participants have tracking`);
    } else {
        // Notify recipient that their item is coming
        await createNotification(
            participant.givesToUserId,
            NotificationType.TRACKING_ADDED,
            '📬 Item Shipped!',
            `Your item is on its way! Tracking: ${trackingNumber}`,
            null
        );

        // Notify the shipper they're waiting for others
        console.log(`[ChainTrade] User ${userId} submitted tracking for chain ${chainId}. Waiting for ${pendingShipments?.count} more.`);
    }

    const updatedProposal = await getChainProposal(chainId) as ChainProposal;
    return { ...updatedProposal, greenLight: allShipped };
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

        // ========================================
        // ESCROW RELEASE & PAYOUTS
        // ========================================
        await processChainEscrowAndPayouts(proposal);

        // Update item ownership correctly
        for (const p of proposal.participants) {
            // The item they receive was given by receivesFromUserId
            const giver = proposal.participants.find(pp => pp.userId === p.receivesFromUserId);
            if (giver) {
                await dbRun(`UPDATE Item SET owner_id = ?, status = 'active' WHERE id = ?`, [p.userId, giver.givesItemId]);
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

/**
 * Process escrow release and payouts for a completed chain trade
 * 1. Capture all PaymentIntents (funds move from buyers)
 * 2. Transfer to recipients who are owed cash (negative cashDelta)
 */
async function processChainEscrowAndPayouts(proposal: ChainProposal): Promise<void> {
    const now = new Date().toISOString();

    // Get all escrow holds for this chain
    const escrowHolds = await dbAll<any>(`
        SELECT * FROM escrow_holds WHERE trade_id = ? AND status = 'FUNDED'
    `, [proposal.id]);

    console.log(`[ChainTrade] Processing ${escrowHolds.length} escrow holds for chain ${proposal.id}`);

    // Step 1: Capture all payments (release from escrow to platform)
    for (const hold of escrowHolds) {
        try {
            if (hold.provider === 'stripe' && hold.provider_reference) {
                // Capture the Stripe PaymentIntent
                await stripePaymentProvider.capturePayment(hold.provider_reference);
                console.log(`[ChainTrade] Captured payment ${hold.provider_reference} for chain ${proposal.id}`);
            }

            // Mark escrow as released
            await dbRun(`
                UPDATE escrow_holds SET status = 'RELEASED', updated_at = ? WHERE id = ?
            `, [now, hold.id]);

        } catch (captureErr: any) {
            console.error(`[ChainTrade] Failed to capture escrow ${hold.id}:`, captureErr.message);
            // Continue processing other holds - we'll handle failures in payouts
        }
    }

    // Step 2: Calculate who receives money (participants with negative cashDelta)
    // Negative cashDelta means they're giving away higher-value items, so they receive cash
    const recipients = proposal.participants.filter(p => p.cashDelta < 0);

    console.log(`[ChainTrade] ${recipients.length} participants to receive payouts for chain ${proposal.id}`);

    // Step 3: Create payouts for each recipient
    for (const recipient of recipients) {
        const amountToReceive = Math.abs(recipient.cashDelta); // Convert negative to positive

        if (amountToReceive <= 0) continue;

        const payoutId = `payout_chain_${proposal.id}_${recipient.userId}_${Date.now()}`;

        try {
            // Check if recipient has Stripe Connect
            const connectedAccount = await dbGet<any>(`
                SELECT stripe_account_id, payouts_enabled FROM connected_accounts WHERE user_id = ?
            `, [recipient.userId]);

            if (!connectedAccount) {
                // No Connect account - create pending payout
                await createChainPayoutRecord(payoutId, proposal.id, recipient.userId, amountToReceive, 'pending_onboarding',
                    'Recipient needs to complete Stripe Connect onboarding');
                console.log(`[ChainTrade] User ${recipient.userId} awaiting Connect onboarding for $${(amountToReceive / 100).toFixed(2)}`);
                continue;
            }

            if (!connectedAccount.payouts_enabled) {
                await createChainPayoutRecord(payoutId, proposal.id, recipient.userId, amountToReceive, 'pending_onboarding',
                    'Stripe Connect payouts not yet enabled');
                continue;
            }

            // Stripe Connect is ready - create transfer
            const stripe = await import('stripe');
            const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY!, {
                apiVersion: '2025-12-15.clover',
            });

            const transfer = await stripeClient.transfers.create({
                amount: amountToReceive,
                currency: 'usd',
                destination: connectedAccount.stripe_account_id,
                description: `Payout for chain trade ${proposal.id}`,
                metadata: {
                    chain_id: proposal.id,
                    payout_id: payoutId,
                    recipient_user_id: String(recipient.userId),
                },
            });

            await createChainPayoutRecord(payoutId, proposal.id, recipient.userId, amountToReceive, 'completed', null, transfer.id);
            console.log(`[ChainTrade] Transferred $${(amountToReceive / 100).toFixed(2)} to user ${recipient.userId} (transfer: ${transfer.id})`);

        } catch (payoutErr: any) {
            console.error(`[ChainTrade] Payout failed for user ${recipient.userId}:`, payoutErr.message);
            await createChainPayoutRecord(payoutId, proposal.id, recipient.userId, amountToReceive, 'failed', payoutErr.message);
        }
    }
}

/**
 * Create a payout record for chain trades
 */
async function createChainPayoutRecord(
    payoutId: string,
    chainId: string,
    recipientUserId: number,
    amountCents: number,
    status: string,
    errorMessage: string | null,
    providerReference?: string
): Promise<void> {
    const now = new Date().toISOString();
    const completedAt = status === 'completed' ? now : null;

    await dbRun(`
        INSERT INTO payouts (id, trade_id, escrow_hold_id, recipient_user_id, amount_cents, status, provider, provider_reference, error_message, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [payoutId, chainId, `chain_${chainId}`, recipientUserId, amountCents, status, 'stripe_connect', providerReference || null, errorMessage, now, now, completedAt]);

    console.log(`[ChainTrade] Created payout record ${payoutId} with status: ${status}`);
}

/**
 * Refund all escrow holds for a chain trade
 * Called when a chain is rejected or fails
 */
async function refundChainEscrows(chainId: string): Promise<void> {
    const now = new Date().toISOString();

    // Get all escrow holds for this chain
    const escrowHolds = await dbAll<any>(`
        SELECT * FROM escrow_holds WHERE trade_id = ? AND status IN ('PENDING', 'FUNDED')
    `, [chainId]);

    console.log(`[ChainTrade] Refunding ${escrowHolds.length} escrow holds for chain ${chainId}`);

    for (const hold of escrowHolds) {
        try {
            if (hold.provider === 'stripe' && hold.provider_reference) {
                // Cancel the Stripe PaymentIntent (releases authorized funds back to buyer)
                await stripePaymentProvider.refundPayment(hold.provider_reference);
                console.log(`[ChainTrade] Cancelled PaymentIntent ${hold.provider_reference} for chain ${chainId}`);
            }

            // Mark escrow as refunded
            await dbRun(`
                UPDATE escrow_holds SET status = 'REFUNDED', updated_at = ? WHERE id = ?
            `, [now, hold.id]);

        } catch (refundErr: any) {
            console.error(`[ChainTrade] Failed to refund escrow ${hold.id}:`, refundErr.message);
            // Continue processing other holds
        }
    }

    console.log(`[ChainTrade] Completed refunds for chain ${chainId}`);
}

