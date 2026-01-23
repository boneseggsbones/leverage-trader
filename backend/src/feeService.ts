/**
 * Fee Calculation Service
 * 
 * Implements the "Trust & Power" monetization strategy:
 * - FREE users: $15 flat escrow fee per trade
 * - PRO users: 3 free trades per billing cycle, then $15 fee
 */

import { db } from './database';

// Fee constants (mirrored from frontend types)
export const FEE_CONSTANTS = {
    FLAT_ESCROW_FEE_CENTS: 1500, // $15.00
    PRO_MONTHLY_PRICE_CENTS: 1200, // $12.00
    PRO_FREE_TRADES_LIMIT: 3
} as const;

export interface FeeCalculationResult {
    feeCents: number;
    isWaived: boolean;
    reason: string;
    remainingFreeTrades?: number;
}

export interface UserSubscriptionData {
    id: number;
    subscription_tier: 'FREE' | 'PRO';
    subscription_status: 'active' | 'past_due' | 'canceled' | 'none';
    trades_this_cycle: number;
    cycle_started_at: string | null;
}

/**
 * Get user subscription data from database
 */
export async function getUserSubscriptionData(userId: number): Promise<UserSubscriptionData | null> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, subscription_tier, subscription_status, trades_this_cycle, cycle_started_at 
       FROM User WHERE id = ?`,
            [userId],
            (err, row: any) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                resolve({
                    id: row.id,
                    subscription_tier: row.subscription_tier || 'FREE',
                    subscription_status: row.subscription_status || 'none',
                    trades_this_cycle: row.trades_this_cycle || 0,
                    cycle_started_at: row.cycle_started_at
                });
            }
        );
    });
}

/**
 * Calculate the platform fee for a trade
 * 
 * Rules:
 * - FREE users always pay $15
 * - PRO users with active subscription get 3 free trades per cycle
 * - PRO users who exceeded limit pay $15
 * - past_due subscriptions are treated as FREE
 */
export async function calculateTradeFee(userId: number): Promise<FeeCalculationResult> {
    const userData = await getUserSubscriptionData(userId);

    if (!userData) {
        return {
            feeCents: FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS,
            isWaived: false,
            reason: 'User not found, applying standard fee'
        };
    }

    const isPro = userData.subscription_tier === 'PRO';
    const isActive = userData.subscription_status === 'active';
    const hasFreeTradesLeft = userData.trades_this_cycle < FEE_CONSTANTS.PRO_FREE_TRADES_LIMIT;

    // Pro user with active subscription and free trades remaining
    if (isPro && isActive && hasFreeTradesLeft) {
        const remaining = FEE_CONSTANTS.PRO_FREE_TRADES_LIMIT - userData.trades_this_cycle - 1;
        return {
            feeCents: 0,
            isWaived: true,
            reason: 'Pro membership waiver',
            remainingFreeTrades: remaining
        };
    }

    // Pro user who exceeded free trades
    if (isPro && isActive && !hasFreeTradesLeft) {
        return {
            feeCents: FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS,
            isWaived: false,
            reason: 'Monthly free trades exceeded (3/3 used)'
        };
    }

    // Pro user with past_due or canceled subscription
    if (isPro && !isActive) {
        return {
            feeCents: FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS,
            isWaived: false,
            reason: 'Subscription not active'
        };
    }

    // FREE user - standard fee
    return {
        feeCents: FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS,
        isWaived: false,
        reason: 'Standard escrow fee'
    };
}

/**
 * Increment the user's trade counter (call after fee is waived)
 */
export async function incrementTradeCounter(userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE User SET trades_this_cycle = trades_this_cycle + 1 WHERE id = ?`,
            [userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

/**
 * Reset trade counter for a user (called at billing cycle start)
 */
export async function resetTradeCounter(userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE User SET trades_this_cycle = 0, cycle_started_at = datetime('now') WHERE id = ?`,
            [userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

/**
 * Upgrade user to Pro subscription
 */
export async function upgradeToProSubscription(
    userId: number,
    stripeSubscriptionId: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE User SET 
         subscription_tier = 'PRO',
         subscription_status = 'active',
         subscription_stripe_id = ?,
         trades_this_cycle = 0,
         cycle_started_at = datetime('now')
       WHERE id = ?`,
            [stripeSubscriptionId, userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}

/**
 * Downgrade user from Pro (on cancellation/failure)
 */
export async function downgradeFromPro(userId: number, status: 'canceled' | 'past_due'): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE User SET subscription_status = ? WHERE id = ?`,
            [status, userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
}
