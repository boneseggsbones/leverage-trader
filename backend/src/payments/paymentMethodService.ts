/**
 * Payment Method Setup Service
 * Handles Stripe SetupIntents for saving payment methods without immediate charge
 */

import Stripe from 'stripe';
import { db } from '../database';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey && stripeSecretKey !== 'sk_test_your_key_here'
    ? new Stripe(stripeSecretKey, { apiVersion: '2025-12-15.clover' })
    : null;

// Check if Stripe is configured
export function isStripeConfigured(): boolean {
    return stripe !== null;
}

// Get or create Stripe Customer for a user
export async function getOrCreateStripeCustomer(userId: number, email?: string, name?: string): Promise<string> {
    if (!stripe) throw new Error('Stripe not configured');

    // Check if user already has a Stripe customer ID
    const existingCustomerId = await new Promise<string | null>((resolve, reject) => {
        db.get(
            'SELECT stripe_customer_id FROM payment_methods WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1',
            [userId],
            (err: Error | null, row: any) => {
                if (err) reject(err);
                else resolve(row?.stripe_customer_id || null);
            }
        );
    });

    if (existingCustomerId) {
        return existingCustomerId;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
        metadata: { leverage_user_id: String(userId) },
        email,
        name,
    });

    console.log(`[Stripe] Created customer ${customer.id} for user ${userId}`);
    return customer.id;
}

// Create a SetupIntent for adding a payment method
export async function createSetupIntent(userId: number, email?: string, name?: string): Promise<{
    clientSecret: string;
    customerId: string;
}> {
    if (!stripe) throw new Error('Stripe not configured');

    const customerId = await getOrCreateStripeCustomer(userId, email, name);

    const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        metadata: { user_id: String(userId) },
    });

    console.log(`[Stripe] Created SetupIntent ${setupIntent.id} for user ${userId}`);

    return {
        clientSecret: setupIntent.client_secret!,
        customerId,
    };
}

// Save a payment method after successful SetupIntent
export async function savePaymentMethod(
    userId: number,
    paymentMethodId: string,
    customerId: string
): Promise<{
    id: number;
    provider: string;
    displayName: string;
    lastFour: string;
    brand: string;
}> {
    if (!stripe) throw new Error('Stripe not configured');

    // Get payment method details from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (!paymentMethod.card) {
        throw new Error('Not a card payment method');
    }

    const brand = paymentMethod.card.brand;
    const lastFour = paymentMethod.card.last4;
    const displayName = `${brand.charAt(0).toUpperCase() + brand.slice(1)} ****${lastFour}`;

    // Check if this is the first payment method (make it default)
    const existingCount = await new Promise<number>((resolve, reject) => {
        db.get(
            'SELECT COUNT(*) as count FROM payment_methods WHERE user_id = ?',
            [userId],
            (err: Error | null, row: any) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            }
        );
    });

    const isDefault = existingCount === 0 ? 1 : 0;
    const now = new Date().toISOString();

    // Insert into database
    const insertId = await new Promise<number>((resolve, reject) => {
        db.run(
            `INSERT INTO payment_methods 
            (user_id, provider, provider_account_id, display_name, is_default, is_verified, stripe_payment_method_id, stripe_customer_id, last_four, brand, connected_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, 'stripe_card', paymentMethodId, displayName, isDefault, 1, paymentMethodId, customerId, lastFour, brand, now],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });

    console.log(`[Stripe] Saved payment method ${paymentMethodId} for user ${userId}`);

    return {
        id: insertId,
        provider: 'stripe_card',
        displayName,
        lastFour,
        brand,
    };
}

// List saved payment methods for a user
export async function listPaymentMethods(userId: number): Promise<Array<{
    id: number;
    provider: string;
    displayName: string;
    lastFour: string | null;
    brand: string | null;
    isDefault: boolean;
    isVerified: boolean;
}>> {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, provider, display_name, last_four, brand, is_default, is_verified 
             FROM payment_methods 
             WHERE user_id = ? 
             ORDER BY is_default DESC, connected_at DESC`,
            [userId],
            (err: Error | null, rows: any[]) => {
                if (err) reject(err);
                else resolve((rows || []).map(row => ({
                    id: row.id,
                    provider: row.provider,
                    displayName: row.display_name,
                    lastFour: row.last_four,
                    brand: row.brand,
                    isDefault: row.is_default === 1,
                    isVerified: row.is_verified === 1,
                })));
            }
        );
    });
}

// Delete a payment method
export async function deletePaymentMethod(userId: number, methodId: number): Promise<void> {
    // Get the Stripe payment method ID
    const method = await new Promise<any>((resolve, reject) => {
        db.get(
            'SELECT stripe_payment_method_id FROM payment_methods WHERE id = ? AND user_id = ?',
            [methodId, userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });

    // Detach from Stripe if it's a Stripe payment method
    if (method?.stripe_payment_method_id && stripe) {
        try {
            await stripe.paymentMethods.detach(method.stripe_payment_method_id);
            console.log(`[Stripe] Detached payment method ${method.stripe_payment_method_id}`);
        } catch (err) {
            console.error('[Stripe] Failed to detach payment method:', err);
        }
    }

    // Delete from database
    await new Promise<void>((resolve, reject) => {
        db.run(
            'DELETE FROM payment_methods WHERE id = ? AND user_id = ?',
            [methodId, userId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Get configuration status for payment providers
export function getPaymentProvidersStatus(): {
    stripe: { configured: boolean; features: string[] };
    plaid: { configured: boolean; features: string[] };
    paypal: { configured: boolean; features: string[] };
    coinbase: { configured: boolean; features: string[] };
} {
    return {
        stripe: {
            configured: isStripeConfigured(),
            features: isStripeConfigured() ? ['cards', 'bank_accounts'] : [],
        },
        plaid: {
            configured: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
            features: [],
        },
        paypal: {
            configured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
            features: [],
        },
        coinbase: {
            configured: Boolean(process.env.COINBASE_CLIENT_ID && process.env.COINBASE_CLIENT_SECRET),
            features: [],
        },
    };
}
