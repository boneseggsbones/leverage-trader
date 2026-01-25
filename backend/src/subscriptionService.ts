/**
 * Subscription Service
 * Handles Pro subscription creation, management, and Stripe integration
 */

import Stripe from 'stripe';
import { db } from './database';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

let stripe: Stripe | null = null;
if (stripeSecretKey) {
    stripe = new Stripe(stripeSecretKey);
}

// Pro subscription price (create this in Stripe Dashboard or via API)
// This should be a recurring price for $12/month
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || 'price_pro_monthly';

export interface SubscriptionResult {
    success: boolean;
    checkoutUrl?: string;
    sessionId?: string;
    error?: string;
}

export interface SubscriptionStatus {
    tier: 'FREE' | 'PRO';
    status: 'active' | 'past_due' | 'canceled' | 'none';
    renewsAt: string | null;
    tradesThisCycle: number;
    cycleStartedAt: string | null;
}

/**
 * Create a Stripe Checkout session for Pro subscription
 */
export async function createProCheckoutSession(
    userId: number,
    successUrl: string,
    cancelUrl: string
): Promise<SubscriptionResult> {
    if (!stripe) {
        return { success: false, error: 'Stripe not configured' };
    }

    try {
        // Get or create Stripe customer for this user
        const user = await new Promise<any>((resolve, reject) => {
            db.get('SELECT id, name, email, stripe_customer_id FROM User WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            return { success: false, error: 'User not found' };
        }

        let customerId = user.stripe_customer_id;

        // Create Stripe customer if doesn't exist
        if (!customerId) {
            const customer = await stripe.customers.create({
                metadata: { userId: String(userId) },
                name: user.name,
                email: user.email || undefined,
            });
            customerId = customer.id;

            // Save customer ID to database
            await new Promise<void>((resolve, reject) => {
                db.run('UPDATE User SET stripe_customer_id = ? WHERE id = ?', [customerId, userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [
                {
                    price: PRO_PRICE_ID,
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId: String(userId),
                type: 'pro_subscription',
            },
            subscription_data: {
                metadata: {
                    userId: String(userId),
                },
            },
        });

        console.log(`[Subscription] Created checkout session ${session.id} for user ${userId}`);

        return {
            success: true,
            checkoutUrl: session.url || undefined,
            sessionId: session.id,
        };
    } catch (err: any) {
        console.error('[Subscription] Error creating checkout session:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Handle successful subscription from Stripe webhook
 */
export async function handleSubscriptionCreated(
    stripeSubscriptionId: string,
    userId: number
): Promise<void> {
    const now = new Date().toISOString();

    await new Promise<void>((resolve, reject) => {
        db.run(
            `UPDATE User SET 
                subscription_tier = 'PRO',
                subscription_status = 'active',
                subscription_stripe_id = ?,
                trades_this_cycle = 0,
                cycle_started_at = ?
            WHERE id = ?`,
            [stripeSubscriptionId, now, userId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    console.log(`[Subscription] User ${userId} upgraded to PRO with subscription ${stripeSubscriptionId}`);
}

/**
 * Handle subscription status update from Stripe webhook
 */
export async function handleSubscriptionUpdated(
    stripeSubscriptionId: string,
    status: 'active' | 'past_due' | 'canceled'
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        db.run(
            `UPDATE User SET subscription_status = ? WHERE subscription_stripe_id = ?`,
            [status, stripeSubscriptionId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    console.log(`[Subscription] Updated subscription ${stripeSubscriptionId} to status: ${status}`);
}

/**
 * Handle subscription cancellation
 */
export async function handleSubscriptionCanceled(stripeSubscriptionId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        db.run(
            `UPDATE User SET 
                subscription_tier = 'FREE',
                subscription_status = 'canceled'
            WHERE subscription_stripe_id = ?`,
            [stripeSubscriptionId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    console.log(`[Subscription] Subscription ${stripeSubscriptionId} canceled, user downgraded to FREE`);
}

/**
 * Get current subscription status for a user
 */
export async function getSubscriptionStatus(userId: number): Promise<SubscriptionStatus> {
    const user = await new Promise<any>((resolve, reject) => {
        db.get(
            `SELECT subscription_tier, subscription_status, subscription_renews_at, 
                    trades_this_cycle, cycle_started_at 
             FROM User WHERE id = ?`,
            [userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    if (!user) {
        return {
            tier: 'FREE',
            status: 'none',
            renewsAt: null,
            tradesThisCycle: 0,
            cycleStartedAt: null,
        };
    }

    return {
        tier: user.subscription_tier || 'FREE',
        status: user.subscription_status || 'none',
        renewsAt: user.subscription_renews_at || null,
        tradesThisCycle: user.trades_this_cycle || 0,
        cycleStartedAt: user.cycle_started_at || null,
    };
}

/**
 * Create customer portal session for subscription management
 */
export async function createCustomerPortalSession(
    userId: number,
    returnUrl: string
): Promise<{ url: string } | { error: string }> {
    if (!stripe) {
        return { error: 'Stripe not configured' };
    }

    try {
        const user = await new Promise<any>((resolve, reject) => {
            db.get('SELECT stripe_customer_id FROM User WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user?.stripe_customer_id) {
            return { error: 'No subscription found' };
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: returnUrl,
        });

        return { url: session.url };
    } catch (err: any) {
        console.error('[Subscription] Error creating portal session:', err);
        return { error: err.message };
    }
}

/**
 * Sync subscription status directly from Stripe
 * Useful for local development where webhooks can't reach localhost
 */
export async function syncSubscriptionFromStripe(userId: number): Promise<{ synced: boolean; tier: string; error?: string }> {
    if (!stripe) {
        return { synced: false, tier: 'FREE', error: 'Stripe not configured' };
    }

    try {
        const user = await new Promise<any>((resolve, reject) => {
            db.get('SELECT stripe_customer_id FROM User WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user?.stripe_customer_id) {
            return { synced: false, tier: 'FREE' };
        }

        // Fetch subscriptions from Stripe
        const subscriptions = await stripe.subscriptions.list({
            customer: user.stripe_customer_id,
            status: 'active',
            limit: 1,
        });

        if (subscriptions.data.length > 0) {
            const sub = subscriptions.data[0];
            const now = new Date().toISOString();

            // Update user's subscription status
            await new Promise<void>((resolve, reject) => {
                db.run(
                    `UPDATE User SET 
                        subscription_tier = 'PRO',
                        subscription_status = 'active',
                        subscription_stripe_id = ?,
                        trades_this_cycle = COALESCE(trades_this_cycle, 0),
                        cycle_started_at = COALESCE(cycle_started_at, ?)
                    WHERE id = ?`,
                    [sub.id, now, userId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            console.log(`[Subscription] Synced user ${userId} to PRO from Stripe`);
            return { synced: true, tier: 'PRO' };
        }

        return { synced: true, tier: 'FREE' };
    } catch (err: any) {
        console.error('[Subscription] Error syncing from Stripe:', err);
        return { synced: false, tier: 'FREE', error: err.message };
    }
}
