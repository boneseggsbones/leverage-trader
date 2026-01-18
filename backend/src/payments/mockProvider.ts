/**
 * Mock Payment Provider
 * Simulates payment and escrow operations for development/testing
 * Replace with StripeProvider, PayPalProvider, etc. for production
 */

import { db } from '../database';
import {
    PaymentProvider,
    PaymentIntent,
    EscrowHold,
    EscrowStatus,
    PaymentStatus,
} from './types';

// Helper to generate IDs
function generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export class MockPaymentProvider implements PaymentProvider {
    readonly name = 'mock';

    async createPaymentIntent(
        amount: number,
        currency: string,
        tradeId: string,
        payerId: number,
        metadata?: Record<string, string>
    ): Promise<PaymentIntent> {
        // In mock mode, payment is instantly "successful"
        const intent: PaymentIntent = {
            id: generateId('pi'),
            amount,
            currency,
            status: PaymentStatus.SUCCEEDED,
            clientSecret: `mock_secret_${generateId('cs')}`,
            providerReference: null,
            metadata: {
                tradeId,
                payerId: String(payerId),
                ...metadata,
            },
        };

        console.log(`[MockPayment] Created payment intent: ${intent.id} for $${amount}`);
        return intent;
    }

    async capturePayment(paymentIntentId: string): Promise<void> {
        // Mock: Already captured on creation
        console.log(`[MockPayment] Captured payment: ${paymentIntentId}`);
    }

    async refundPayment(paymentIntentId: string, amount?: number): Promise<void> {
        console.log(`[MockPayment] Refunded payment: ${paymentIntentId} ${amount ? `($${amount})` : '(full)'}`);
    }

    async holdFunds(
        amount: number,
        tradeId: string,
        payerId: number,
        recipientId: number
    ): Promise<EscrowHold> {
        const id = generateId('escrow');
        const now = new Date().toISOString();

        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO escrow_holds 
                (id, trade_id, payer_id, recipient_id, amount, status, provider, provider_reference, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, tradeId, payerId, recipientId, amount, EscrowStatus.FUNDED, this.name, null, now, now],
                function (err) {
                    if (err) {
                        console.error('[MockPayment] Failed to hold funds:', err);
                        reject(err);
                    } else {
                        const hold: EscrowHold = {
                            id,
                            tradeId,
                            payerId,
                            recipientId,
                            amount,
                            status: EscrowStatus.FUNDED,
                            provider: 'mock',
                            providerReference: null,
                            createdAt: now,
                            updatedAt: now,
                        };
                        console.log(`[MockPayment] Funds held in escrow: $${amount} for trade ${tradeId}`);
                        resolve(hold);
                    }
                }
            );
        });
    }

    async releaseFunds(escrowHoldId: string): Promise<void> {
        const now = new Date().toISOString();

        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE id = ?`,
                [EscrowStatus.RELEASED, now, escrowHoldId],
                function (err) {
                    if (err) {
                        console.error('[MockPayment] Failed to release funds:', err);
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error(`Escrow hold not found: ${escrowHoldId}`));
                    } else {
                        console.log(`[MockPayment] Funds released from escrow: ${escrowHoldId}`);
                        resolve();
                    }
                }
            );
        });
    }

    async refundHeldFunds(escrowHoldId: string, amount?: number): Promise<void> {
        const now = new Date().toISOString();
        const status = amount ? EscrowStatus.PARTIALLY_REFUNDED : EscrowStatus.REFUNDED;

        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE id = ?`,
                [status, now, escrowHoldId],
                function (err) {
                    if (err) {
                        console.error('[MockPayment] Failed to refund funds:', err);
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error(`Escrow hold not found: ${escrowHoldId}`));
                    } else {
                        console.log(`[MockPayment] Funds refunded from escrow: ${escrowHoldId} ${amount ? `($${amount})` : '(full)'}`);
                        resolve();
                    }
                }
            );
        });
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
                        resolve({
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
                        });
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
                        resolve({
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
                        });
                    }
                }
            );
        });
    }
}

// Export singleton instance
export const mockPaymentProvider = new MockPaymentProvider();
