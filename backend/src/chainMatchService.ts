/**
 * Chain Match Service
 * Builds a trade graph and detects cycles for multi-party chain trades
 * 
 * The algorithm:
 * 1. Build directed graph: User A → User B if A has an item B wants
 * 2. Find cycles of length 3 (triangles) using DFS
 * 3. Calculate cash balances to achieve net-zero fairness
 * 4. Validate chains against business rules
 */

import { db } from './database';

// ============================================
// Types
// ============================================

export interface ChainEdge {
    fromUserId: number;
    toUserId: number;
    itemId: number;
    itemName: string;
    valueCents: number;
}

export interface TradeGraph {
    edges: Map<number, ChainEdge[]>; // userId → outgoing edges
    userNames: Map<number, string>;
    userRatings: Map<number, number>;
    userStates: Map<number, string>;
    userTradeCount: Map<number, number>;
}

export interface ChainCycle {
    edges: ChainEdge[]; // Ordered: [A→B, B→C, C→A]
    participantIds: number[];
    totalValueCents: number;
    cashBalances: Map<number, number>; // userId → cash delta (+ owes, - receives)
}

export interface ChainValidationResult {
    isValid: boolean;
    reason?: string;
}

// ============================================
// Configuration
// ============================================

const CONFIG = {
    MAX_CHAIN_DEPTH: 3, // Only support triangles for now
    VALUE_TOLERANCE_PERCENT: 15, // Max % difference allowed
    MIN_REPUTATION: 3.5, // Minimum rating to participate
    MIN_TRADES_COMPLETED: 0, // Set to 0 for testing, increase in production
};

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

// ============================================
// Graph Building
// ============================================

/**
 * Build the trade graph from wishlists and inventory
 * Edge A→B exists if User A has an item that User B wants (via Wishlist)
 */
export async function buildTradeGraph(): Promise<TradeGraph> {
    const graph: TradeGraph = {
        edges: new Map(),
        userNames: new Map(),
        userRatings: new Map(),
        userStates: new Map(),
        userTradeCount: new Map(),
    };

    // Get all users with their metadata
    const users = await dbAll<{
        id: number;
        name: string;
        rating: number | null;
        state: string | null;
    }>(`SELECT id, name, rating, state FROM User`);

    for (const user of users) {
        graph.userNames.set(user.id, user.name || `User ${user.id}`);
        graph.userRatings.set(user.id, user.rating ?? 5.0);
        graph.userStates.set(user.id, user.state || 'unknown');
        graph.edges.set(user.id, []);
    }

    // Count completed trades per user
    const tradeCounts = await dbAll<{ user_id: number; count: number }>(`
    SELECT user_id, COUNT(*) as count FROM (
      SELECT proposerId as user_id FROM trades WHERE status = 'COMPLETED'
      UNION ALL
      SELECT receiverId as user_id FROM trades WHERE status = 'COMPLETED'
    ) GROUP BY user_id
  `);

    for (const tc of tradeCounts) {
        graph.userTradeCount.set(tc.user_id, tc.count);
    }

    // Build edges: A → B where A owns item that B wishlisted
    // Wishlist table: userId (who wants) → itemId (what they want)
    // So we need: Item.owner_id (A) → Wishlist.userId (B) via Wishlist.itemId
    const edges = await dbAll<{
        owner_id: number;
        wanter_id: number;
        item_id: number;
        item_name: string;
        value_cents: number;
    }>(`
    SELECT 
      i.owner_id,
      w.userId as wanter_id,
      i.id as item_id,
      i.name as item_name,
      COALESCE(i.estimatedMarketValue, 0) as value_cents
    FROM Wishlist w
    JOIN Item i ON w.itemId = i.id
    WHERE i.owner_id != w.userId
      AND COALESCE(i.status, 'active') = 'active'
  `);

    for (const edge of edges) {
        const fromEdges = graph.edges.get(edge.owner_id) || [];
        fromEdges.push({
            fromUserId: edge.owner_id,
            toUserId: edge.wanter_id,
            itemId: edge.item_id,
            itemName: edge.item_name,
            valueCents: edge.value_cents,
        });
        graph.edges.set(edge.owner_id, fromEdges);
    }

    return graph;
}

// ============================================
// Cycle Detection (DFS)
// ============================================

/**
 * Find all cycles of exactly the specified length starting from a user
 */
export function findCyclesFromUser(
    graph: TradeGraph,
    startUserId: number,
    maxDepth: number = CONFIG.MAX_CHAIN_DEPTH
): ChainCycle[] {
    const cycles: ChainCycle[] = [];
    const path: ChainEdge[] = [];
    const visitedInPath = new Set<number>();

    function dfs(currentUserId: number, depth: number): void {
        if (depth > maxDepth) return;

        // Check if we've completed a cycle back to start
        if (depth === maxDepth && currentUserId === startUserId && path.length === maxDepth) {
            // Found a valid cycle!
            const cycle = createCycleFromPath([...path]);
            if (cycle) {
                cycles.push(cycle);
            }
            return;
        }

        // Prevent revisiting nodes in current path (except completing cycle)
        if (visitedInPath.has(currentUserId) && currentUserId !== startUserId) {
            return;
        }

        const outgoingEdges = graph.edges.get(currentUserId) || [];

        for (const edge of outgoingEdges) {
            // Skip if target is in path (unless it completes the cycle)
            if (visitedInPath.has(edge.toUserId) && edge.toUserId !== startUserId) {
                continue;
            }

            // Skip if not completing cycle at wrong depth
            if (edge.toUserId === startUserId && depth + 1 !== maxDepth) {
                continue;
            }

            visitedInPath.add(currentUserId);
            path.push(edge);
            dfs(edge.toUserId, depth + 1);
            path.pop();
            visitedInPath.delete(currentUserId);
        }
    }

    dfs(startUserId, 0);
    return cycles;
}

/**
 * Find all unique cycles in the graph
 */
export function findAllCycles(
    graph: TradeGraph,
    maxDepth: number = CONFIG.MAX_CHAIN_DEPTH
): ChainCycle[] {
    const allCycles: ChainCycle[] = [];
    const seenCycleKeys = new Set<string>();

    for (const userId of graph.edges.keys()) {
        const userCycles = findCyclesFromUser(graph, userId, maxDepth);

        for (const cycle of userCycles) {
            // Normalize cycle key to avoid duplicates (sort participant IDs)
            const key = [...cycle.participantIds].sort((a, b) => a - b).join('-');
            if (!seenCycleKeys.has(key)) {
                seenCycleKeys.add(key);
                allCycles.push(cycle);
            }
        }
    }

    return allCycles;
}

// ============================================
// Cash Balance Calculation
// ============================================

/**
 * Create a cycle object with calculated cash balances
 */
function createCycleFromPath(edges: ChainEdge[]): ChainCycle | null {
    if (edges.length === 0) return null;

    const participantIds = edges.map(e => e.fromUserId);
    const totalValueCents = edges.reduce((sum, e) => sum + e.valueCents, 0);

    // Calculate cash balances for net-zero fairness
    // Each user: gives item worth X, receives item worth Y
    // Balance = X - Y (positive = owes cash, negative = receives cash)
    const cashBalances = new Map<number, number>();

    for (let i = 0; i < edges.length; i++) {
        const userId = edges[i].fromUserId;
        const givesValue = edges[i].valueCents;
        // What they receive is the previous edge in the cycle
        const prevIndex = (i - 1 + edges.length) % edges.length;
        const receivesValue = edges[prevIndex].valueCents;

        cashBalances.set(userId, givesValue - receivesValue);
    }

    return {
        edges,
        participantIds,
        totalValueCents,
        cashBalances,
    };
}

// ============================================
// Validation
// ============================================

/**
 * Validate a chain against business rules
 */
export function validateChain(
    cycle: ChainCycle,
    graph: TradeGraph
): ChainValidationResult {
    // Check minimum reputation
    for (const userId of cycle.participantIds) {
        const rating = graph.userRatings.get(userId) ?? 0;
        if (rating < CONFIG.MIN_REPUTATION) {
            return {
                isValid: false,
                reason: `User ${userId} has insufficient reputation (${rating} < ${CONFIG.MIN_REPUTATION})`,
            };
        }
    }

    // Check minimum completed trades
    for (const userId of cycle.participantIds) {
        const count = graph.userTradeCount.get(userId) ?? 0;
        if (count < CONFIG.MIN_TRADES_COMPLETED) {
            return {
                isValid: false,
                reason: `User ${userId} has insufficient trade history (${count} < ${CONFIG.MIN_TRADES_COMPLETED})`,
            };
        }
    }

    // Check geographic constraint (all users in same country/state region)
    const states = cycle.participantIds.map(id => graph.userStates.get(id));
    const hasUnknownLocation = states.some(s => !s || s === 'unknown');
    if (hasUnknownLocation) {
        // Allow for now, but flag
        console.log('[ChainMatch] Warning: Some users have unknown locations');
    }

    // Check value tolerance
    const avgValue = cycle.totalValueCents / cycle.edges.length;
    const maxCashDelta = Math.max(...Array.from(cycle.cashBalances.values()).map(Math.abs));
    const tolerancePercent = (maxCashDelta / avgValue) * 100;

    if (tolerancePercent > CONFIG.VALUE_TOLERANCE_PERCENT) {
        return {
            isValid: false,
            reason: `Value imbalance too high: ${tolerancePercent.toFixed(1)}% exceeds ${CONFIG.VALUE_TOLERANCE_PERCENT}%`,
        };
    }

    // All items must have positive value
    for (const edge of cycle.edges) {
        if (edge.valueCents <= 0) {
            return {
                isValid: false,
                reason: `Item ${edge.itemId} has no value assigned`,
            };
        }
    }

    return { isValid: true };
}

/**
 * Generate a hash for a cycle to match against rejected_chains
 */
function generateCycleHash(cycle: ChainCycle): string {
    // Sort participants to make hash order-independent
    const participantData = cycle.edges
        .map(e => `${e.fromUserId}:${e.itemId}`)
        .sort()
        .join('|');

    // Create a simple hash
    let hash = 0;
    for (let i = 0; i < participantData.length; i++) {
        const char = participantData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return `cycle_${Math.abs(hash).toString(16)}`;
}

/**
 * Scan the entire graph and find all valid chains
 * Gap 2 Fix: Filters out rejected cycles within 30-day cooldown
 */
export async function findValidChains(): Promise<ChainCycle[]> {
    console.log('[ChainMatch] Building trade graph...');
    const graph = await buildTradeGraph();

    console.log(`[ChainMatch] Graph built: ${graph.edges.size} users`);
    let totalEdges = 0;
    for (const edges of graph.edges.values()) {
        totalEdges += edges.length;
    }
    console.log(`[ChainMatch] Total edges: ${totalEdges}`);

    console.log('[ChainMatch] Finding cycles...');
    const allCycles = findAllCycles(graph);
    console.log(`[ChainMatch] Found ${allCycles.length} cycles`);

    // Gap 2 Fix: Load rejected cycle hashes (unexpired)
    let rejectedHashes = new Set<string>();
    try {
        const rejectedRows = await dbAll<{ cycle_hash: string }>(
            `SELECT cycle_hash FROM rejected_chains WHERE expires_at > datetime('now')`
        );
        rejectedHashes = new Set(rejectedRows.map(r => r.cycle_hash));
        if (rejectedHashes.size > 0) {
            console.log(`[ChainMatch] Filtering out ${rejectedHashes.size} rejected cycles`);
        }
    } catch (e) {
        console.warn('[ChainMatch] Could not load rejected chains (table may not exist yet)');
    }

    // Validate each cycle and filter rejected ones
    const validCycles: ChainCycle[] = [];
    for (const cycle of allCycles) {
        // Check if this cycle was previously rejected
        const cycleHash = generateCycleHash(cycle);
        if (rejectedHashes.has(cycleHash)) {
            console.log(`[ChainMatch] Cycle ${cycleHash} filtered (on cooldown)`);
            continue;
        }

        const validation = validateChain(cycle, graph);
        if (validation.isValid) {
            validCycles.push(cycle);
        } else {
            console.log(`[ChainMatch] Cycle rejected: ${validation.reason}`);
        }
    }

    console.log(`[ChainMatch] ${validCycles.length} valid chains found`);
    return validCycles;
}

/**
 * Find chains involving a specific user
 */
export async function findChainsForUser(userId: number): Promise<ChainCycle[]> {
    const allChains = await findValidChains();
    return allChains.filter(chain => chain.participantIds.includes(userId));
}

/**
 * Get graph statistics for debugging/admin
 */
export async function getGraphStats(): Promise<{
    totalUsers: number;
    totalEdges: number;
    usersWithOutgoingEdges: number;
    maxOutDegree: number;
}> {
    const graph = await buildTradeGraph();

    let totalEdges = 0;
    let usersWithEdges = 0;
    let maxOutDegree = 0;

    for (const edges of graph.edges.values()) {
        totalEdges += edges.length;
        if (edges.length > 0) usersWithEdges++;
        maxOutDegree = Math.max(maxOutDegree, edges.length);
    }

    return {
        totalUsers: graph.edges.size,
        totalEdges,
        usersWithOutgoingEdges: usersWithEdges,
        maxOutDegree,
    };
}
