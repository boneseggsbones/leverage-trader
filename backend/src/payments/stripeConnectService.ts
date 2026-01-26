/**
 * Stripe Connect Service
 * Handles recipient onboarding and payouts via Stripe Connect Express
 */

import Stripe from 'stripe';
import { db } from '../database';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.warn('[StripeConnect] STRIPE_SECRET_KEY not configured');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
}) : null;

function ensureStripe(): Stripe {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }
    return stripe;
}

export interface ConnectedAccount {
    id: number;
    userId: number;
    stripeAccountId: string;
    onboardingComplete: boolean;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    email: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Create a Stripe Connect Express account for a user
 */
export async function createConnectedAccount(
    userId: number,
    email: string
): Promise<{ accountId: string; onboardingUrl: string }> {
    const stripeClient = ensureStripe();

    // Check if user already has a connected account
    const existing = await getConnectedAccount(userId);
    if (existing) {
        // Verify the account is still valid on Stripe's side
        try {
            await stripeClient.accounts.retrieve(existing.stripeAccountId);
            // Account exists on Stripe - generate new onboarding link if not complete
            if (!existing.onboardingComplete) {
                const link = await createOnboardingLink(existing.stripeAccountId);
                return { accountId: existing.stripeAccountId, onboardingUrl: link };
            }
            throw new Error('User already has a connected account');
        } catch (stripeErr: any) {
            // Account is broken on Stripe's side - delete local record and create new
            console.log(`[StripeConnect] Existing account ${existing.stripeAccountId} is invalid, creating new account`);
            await new Promise<void>((resolve, reject) => {
                db.run('DELETE FROM connected_accounts WHERE user_id = ?', [userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            // Fall through to create a new account
        }
    }

    // Use a completely unique test email to avoid Stripe email conflicts
    // The user's real email may already be associated with a Stripe dashboard account
    // which causes "User not found" errors in test mode
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 8);
    const testEmail = `leverage_test_${userId}_${randomPart}_${timestamp}@example.com`;

    console.log(`[StripeConnect] Creating Express account for user ${userId} with test email ${testEmail}`);

    // Create Express account
    const account = await stripeClient.accounts.create({
        type: 'express',
        country: 'US',
        email: testEmail,
        capabilities: {
            transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
            leverage_user_id: userId.toString(),
        },
    });

    // Save to database
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
        db.run(
            `INSERT INTO connected_accounts (user_id, stripe_account_id, email, onboarding_complete, payouts_enabled, charges_enabled, created_at, updated_at)
             VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
            [userId, account.id, email, now, now],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    // Create onboarding link
    const onboardingUrl = await createOnboardingLink(account.id);

    console.log(`[StripeConnect] Created account ${account.id} for user ${userId}`);

    return { accountId: account.id, onboardingUrl };
}

/**
 * Create an onboarding link for a Connect account
 */
export async function createOnboardingLink(stripeAccountId: string): Promise<string> {
    const stripeClient = ensureStripe();

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    console.log(`[StripeConnect] Creating account link for ${stripeAccountId}`);

    const accountLink = await stripeClient.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${baseUrl}/profile?tab=payment-methods&connect_refresh=true`,
        return_url: `${baseUrl}/profile?tab=payment-methods&connect_success=true`,
        type: 'account_onboarding',
        collect: 'currently_due',  // Only collect what's needed
    });

    console.log(`[StripeConnect] Account link created: ${accountLink.url}`);
    return accountLink.url;
}

/**
 * Get connected account for a user
 */
export async function getConnectedAccount(userId: number): Promise<ConnectedAccount | null> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id, user_id as userId, stripe_account_id as stripeAccountId, 
                    onboarding_complete as onboardingComplete, payouts_enabled as payoutsEnabled,
                    charges_enabled as chargesEnabled, email, created_at as createdAt, updated_at as updatedAt
             FROM connected_accounts WHERE user_id = ?`,
            [userId],
            (err, row: any) => {
                if (err) reject(err);
                else resolve(row ? {
                    ...row,
                    onboardingComplete: !!row.onboardingComplete,
                    payoutsEnabled: !!row.payoutsEnabled,
                    chargesEnabled: !!row.chargesEnabled,
                } : null);
            }
        );
    });
}

/**
 * Update connected account status from Stripe
 */
export async function refreshConnectedAccountStatus(userId: number): Promise<ConnectedAccount | null> {
    const stripeClient = ensureStripe();
    const account = await getConnectedAccount(userId);

    if (!account) return null;

    const stripeAccount = await stripeClient.accounts.retrieve(account.stripeAccountId);

    const now = new Date().toISOString();
    const onboardingComplete = stripeAccount.details_submitted ?? false;
    const payoutsEnabled = stripeAccount.payouts_enabled ?? false;
    const chargesEnabled = stripeAccount.charges_enabled ?? false;

    await new Promise<void>((resolve, reject) => {
        db.run(
            `UPDATE connected_accounts 
             SET onboarding_complete = ?, payouts_enabled = ?, charges_enabled = ?, updated_at = ?
             WHERE user_id = ?`,
            [onboardingComplete ? 1 : 0, payoutsEnabled ? 1 : 0, chargesEnabled ? 1 : 0, now, userId],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });

    return {
        ...account,
        onboardingComplete,
        payoutsEnabled,
        chargesEnabled,
        updatedAt: now,
    };
}

/**
 * Transfer funds to a connected account
 */
export async function transferToConnectedAccount(
    recipientUserId: number,
    amountCents: number,
    tradeId: string,
    description: string
): Promise<{ transferId: string; success: boolean }> {
    const stripeClient = ensureStripe();

    const account = await getConnectedAccount(recipientUserId);
    if (!account) {
        throw new Error(`User ${recipientUserId} does not have a connected account`);
    }

    if (!account.payoutsEnabled) {
        throw new Error(`User ${recipientUserId}'s account is not enabled for payouts`);
    }

    // Create transfer to connected account
    const transfer = await stripeClient.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: account.stripeAccountId,
        description: description,
        metadata: {
            trade_id: tradeId,
            recipient_user_id: recipientUserId.toString(),
        },
    });

    console.log(`[StripeConnect] Transferred $${(amountCents / 100).toFixed(2)} to user ${recipientUserId} for trade ${tradeId}`);

    return { transferId: transfer.id, success: true };
}

/**
 * Create the connected_accounts table if it doesn't exist
 */
export async function initConnectedAccountsTable(): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS connected_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER UNIQUE NOT NULL,
                stripe_account_id TEXT UNIQUE NOT NULL,
                email TEXT,
                onboarding_complete INTEGER DEFAULT 0,
                payouts_enabled INTEGER DEFAULT 0,
                charges_enabled INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `, function (err) {
            if (err) reject(err);
            else {
                console.log('[StripeConnect] Connected accounts table initialized');
                resolve();
            }
        });
    });
}
