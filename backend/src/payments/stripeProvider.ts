/**
 * Stripe Payment Provider
 * Real payment processing using Stripe API
 */

import Stripe from 'stripe';
import { db } from '../database';
import {
    PaymentProvider,
    PaymentIntent,
    EscrowHold,
    EscrowStatus,
    PaymentStatus,
} from './types';
import { createStripeProcessorToken } from './plaidService';

// Initialize Stripe with secret key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey || stripeSecretKey === 'sk_test_your_key_here') {
    console.warn('[Stripe] STRIPE_SECRET_KEY not configured - Stripe payments will fail');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
}) : null;

// Helper to generate IDs
function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to extract PaymentIntent ID from clientSecret
// Format: pi_xxx_secret_yyy -> pi_xxx
function extractPaymentIntentId(clientSecret: string): string {
    const parts = clientSecret.split('_secret_');
    return parts[0];
}

export class StripePaymentProvider implements PaymentProvider {
    readonly name = 'stripe';

    private ensureStripe(): Stripe {
        if (!stripe) {
            throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
        }
        return stripe;
    }

    async createPaymentIntent(
        amount: number,
        currency: string,
        tradeId: string,
        payerId: number,
        metadata?: Record<string, string>,
        platformFeeCents: number = 0
    ): Promise<PaymentIntent> {
        const stripeClient = this.ensureStripe();

        const totalAmount = amount + platformFeeCents;

        // Create a PaymentIntent with manual capture for escrow-style holds
        const intent = await stripeClient.paymentIntents.create({
            amount: totalAmount, // Total amount (cash + fee) in cents
            currency: currency.toLowerCase(),
            capture_method: 'manual', // Don't capture immediately - hold funds
            metadata: {
                tradeId,
                payerId: String(payerId),
                cashComponent: String(amount),
                feeComponent: String(platformFeeCents),
                type: platformFeeCents > 0 ? 'trade_escrow_plus_fee' : 'trade_escrow',
                ...metadata,
            },
        });

        console.log(`[Stripe] Created PaymentIntent: ${intent.id} for total $${totalAmount / 100} (cash: $${amount / 100}, fee: $${platformFeeCents / 100})`);

        return {
            id: intent.id,
            amount: totalAmount,
            currency,
            status: this.mapStripeStatus(intent.status),
            clientSecret: intent.client_secret || undefined,
            providerReference: intent.id,
            metadata: {
                tradeId,
                payerId: String(payerId),
                cashComponent: String(amount),
                feeComponent: String(platformFeeCents),
                ...metadata,
            },
        };
    }

    async capturePayment(paymentIntentId: string): Promise<void> {
        const stripeClient = this.ensureStripe();
        await stripeClient.paymentIntents.capture(paymentIntentId);
        console.log(`[Stripe] Captured payment: ${paymentIntentId}`);
    }

    async refundPayment(paymentIntentId: string, amount?: number): Promise<void> {
        const stripeClient = this.ensureStripe();
        await stripeClient.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount, // Partial refund if specified
        });
        console.log(`[Stripe] Refunded payment: ${paymentIntentId} ${amount ? `($${amount / 100})` : '(full)'}`);
    }

    async holdFunds(
        amount: number,
        tradeId: string,
        payerId: number,
        recipientId: number
    ): Promise<EscrowHold & { clientSecret?: string }> {
        // Create PaymentIntent with manual capture
        const paymentIntent = await this.createPaymentIntent(
            amount,
            'usd',
            tradeId,
            payerId,
            { recipientId: String(recipientId) }
        );

        const id = generateId('escrow');
        const now = new Date().toISOString();
        // Store PaymentIntent ID (not clientSecret) for later capture/refund
        const paymentIntentId = paymentIntent.providerReference;

        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO escrow_holds 
                (id, trade_id, payer_id, recipient_id, amount, status, provider, provider_reference, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, tradeId, payerId, recipientId, amount, EscrowStatus.PENDING, this.name, paymentIntentId, now, now],
                function (err) {
                    if (err) {
                        console.error('[Stripe] Failed to create escrow hold:', err);
                        reject(err);
                    } else {
                        const hold: EscrowHold & { clientSecret?: string } = {
                            id,
                            tradeId,
                            payerId,
                            recipientId,
                            amount,
                            status: EscrowStatus.PENDING,
                            provider: 'stripe',
                            providerReference: paymentIntentId,
                            createdAt: now,
                            updatedAt: now,
                            clientSecret: paymentIntent.clientSecret, // Return separately for frontend
                        };
                        console.log(`[Stripe] Created escrow hold: ${id} for trade ${tradeId}, PI: ${paymentIntentId}`);
                        resolve(hold);
                    }
                }
            );
        });
    }

    async releaseFunds(escrowHoldId: string): Promise<void> {
        const stripeClient = this.ensureStripe();
        const hold = await this.getEscrowHold(escrowHoldId);

        if (!hold) {
            throw new Error(`Escrow hold not found: ${escrowHoldId}`);
        }

        if (!hold.providerReference) {
            throw new Error(`No Stripe PaymentIntent for escrow: ${escrowHoldId}`);
        }

        // Capture the payment (releases authorized funds to Stripe balance)
        await stripeClient.paymentIntents.capture(hold.providerReference);

        // Update escrow_holds status
        const now = new Date().toISOString();
        await new Promise<void>((resolve, reject) => {
            db.run(
                `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE id = ?`,
                [EscrowStatus.RELEASED, now, escrowHoldId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`[Stripe] Captured payment for escrow: ${escrowHoldId}`);

        // Now transfer funds to the recipient via Stripe Connect
        await this.processPayoutToRecipient(hold, escrowHoldId);
    }

    /**
     * Process payout to recipient via Stripe Connect
     * Creates a payout record and attempts to transfer funds
     */
    private async processPayoutToRecipient(hold: EscrowHold, escrowHoldId: string): Promise<void> {
        const payoutId = generateId('payout');
        const now = new Date().toISOString();

        try {
            // Check if recipient has a Stripe Connect account
            const connectedAccount = await new Promise<any>((resolve, reject) => {
                db.get(
                    `SELECT stripe_account_id, payouts_enabled, onboarding_complete 
                     FROM connected_accounts WHERE user_id = ?`,
                    [hold.recipientId],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!connectedAccount) {
                // Recipient hasn't set up Stripe Connect - create pending payout
                console.log(`[Payout] Recipient ${hold.recipientId} has no Connect account - payout pending onboarding`);
                await this.createPayoutRecord(payoutId, hold, escrowHoldId, 'pending_onboarding',
                    'Recipient needs to complete Stripe Connect onboarding to receive payout');
                return;
            }

            if (!connectedAccount.payouts_enabled) {
                // Connect account exists but payouts not enabled
                console.log(`[Payout] Recipient ${hold.recipientId} Connect account not enabled for payouts`);
                await this.createPayoutRecord(payoutId, hold, escrowHoldId, 'pending_onboarding',
                    'Stripe Connect payouts not yet enabled - complete verification');
                return;
            }

            // Stripe Connect is ready - create transfer
            const stripeClient = this.ensureStripe();

            // Create transfer to connected account
            const transfer = await stripeClient.transfers.create({
                amount: Math.round(hold.amount), // Amount in cents
                currency: 'usd',
                destination: connectedAccount.stripe_account_id,
                description: `Payout for trade ${hold.tradeId}`,
                metadata: {
                    trade_id: hold.tradeId,
                    escrow_hold_id: escrowHoldId,
                    payout_id: payoutId,
                    recipient_user_id: String(hold.recipientId),
                },
            });

            console.log(`[Payout] Successfully transferred $${(hold.amount / 100).toFixed(2)} to user ${hold.recipientId} (transfer: ${transfer.id})`);

            // Record successful payout
            await this.createPayoutRecord(payoutId, hold, escrowHoldId, 'completed', null, transfer.id);

        } catch (payoutError: any) {
            // Payout failed - record for retry
            console.error(`[Payout] Failed for escrow ${escrowHoldId}:`, payoutError.message);
            await this.createPayoutRecord(payoutId, hold, escrowHoldId, 'failed', payoutError.message);
        }
    }

    /**
     * Create a payout record in the database
     */
    private async createPayoutRecord(
        payoutId: string,
        hold: EscrowHold,
        escrowHoldId: string,
        status: string,
        errorMessage: string | null,
        providerReference?: string
    ): Promise<void> {
        const now = new Date().toISOString();
        const completedAt = status === 'completed' ? now : null;

        await new Promise<void>((resolve, reject) => {
            db.run(
                `INSERT INTO payouts (id, trade_id, escrow_hold_id, recipient_user_id, amount_cents, status, provider, provider_reference, error_message, created_at, updated_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [payoutId, hold.tradeId, escrowHoldId, hold.recipientId, Math.round(hold.amount), status, 'stripe_connect', providerReference || null, errorMessage, now, now, completedAt],
                function (err) {
                    if (err) {
                        console.error('[Payout] Failed to create payout record:', err);
                        reject(err);
                    } else {
                        console.log(`[Payout] Created record ${payoutId} with status: ${status}`);
                        resolve();
                    }
                }
            );
        });
    }

    async refundHeldFunds(escrowHoldId: string, amount?: number): Promise<void> {
        const stripeClient = this.ensureStripe();
        const hold = await this.getEscrowHold(escrowHoldId);

        if (!hold) {
            throw new Error(`Escrow hold not found: ${escrowHoldId}`);
        }

        if (!hold.providerReference) {
            throw new Error(`No Stripe PaymentIntent for escrow: ${escrowHoldId}`);
        }

        // Cancel the uncaptured PaymentIntent (returns authorized funds)
        await stripeClient.paymentIntents.cancel(hold.providerReference);

        // Update database
        const now = new Date().toISOString();
        const status = amount ? EscrowStatus.PARTIALLY_REFUNDED : EscrowStatus.REFUNDED;
        await new Promise<void>((resolve, reject) => {
            db.run(
                `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE id = ?`,
                [status, now, escrowHoldId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`[Stripe] Refunded escrow: ${escrowHoldId}`);
    }

    async getEscrowHold(escrowHoldId: string): Promise<EscrowHold | null> {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM escrow_holds WHERE id = ?`,
                [escrowHoldId],
                (err: Error | null, row: any) => {
                    if (err) {
                        reject(err);
                    } else if (!row) {
                        resolve(null);
                    } else {
                        resolve(this.rowToEscrowHold(row));
                    }
                }
            );
        });
    }

    async getEscrowHoldForTrade(tradeId: string): Promise<EscrowHold | null> {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM escrow_holds WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1`,
                [tradeId],
                (err: Error | null, row: any) => {
                    if (err) {
                        reject(err);
                    } else if (!row) {
                        resolve(null);
                    } else {
                        resolve(this.rowToEscrowHold(row));
                    }
                }
            );
        });
    }

    // Update escrow status after frontend payment confirmation
    async confirmPayment(escrowHoldId: string): Promise<void> {
        const now = new Date().toISOString();
        await new Promise<void>((resolve, reject) => {
            db.run(
                `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE id = ?`,
                [EscrowStatus.FUNDED, now, escrowHoldId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        console.log(`[Stripe] Confirmed payment for escrow: ${escrowHoldId}`);
    }

    private rowToEscrowHold(row: any): EscrowHold {
        return {
            id: row.id,
            tradeId: row.trade_id,
            payerId: row.payer_id,
            recipientId: row.recipient_id,
            amount: row.amount,
            status: row.status as EscrowStatus,
            provider: row.provider,
            providerReference: row.provider_reference,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private mapStripeStatus(status: string): PaymentStatus {
        switch (status) {
            case 'succeeded':
                return PaymentStatus.SUCCEEDED;
            case 'processing':
                return PaymentStatus.PROCESSING;
            case 'requires_payment_method':
            case 'requires_confirmation':
            case 'requires_action':
                return PaymentStatus.PENDING;
            case 'canceled':
                return PaymentStatus.CANCELLED;
            default:
                return PaymentStatus.PENDING;
        }
    }
}

// Export singleton instance
export const stripePaymentProvider = new StripePaymentProvider();
