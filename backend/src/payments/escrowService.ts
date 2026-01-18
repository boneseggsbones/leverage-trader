/**
 * Escrow Service
 * High-level escrow operations for trades
 * Uses the configured PaymentProvider for actual payment handling
 */

import { db } from '../database';
import { PaymentProvider, CashDifferential, EscrowHold, EscrowStatus } from './types';
import { MockPaymentProvider } from './mockProvider';

// Get configured payment provider
// TODO: Make this configurable via environment variable
function getPaymentProvider(): PaymentProvider {
    const provider = process.env.PAYMENT_PROVIDER || 'mock';

    switch (provider) {
        case 'mock':
            return new MockPaymentProvider();
        // case 'stripe':
        //     return new StripePaymentProvider();
        // case 'paypal':
        //     return new PayPalPaymentProvider();
        default:
            console.warn(`Unknown payment provider: ${provider}, falling back to mock`);
            return new MockPaymentProvider();
    }
}

const paymentProvider = getPaymentProvider();

/**
 * Calculate the cash differential for a trade
 * Returns who needs to pay whom and how much
 */
export async function calculateCashDifferential(tradeId: string): Promise<CashDifferential> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM trades WHERE id = ?`,
            [tradeId],
            (err: Error | null, trade: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!trade) {
                    reject(new Error(`Trade not found: ${tradeId}`));
                    return;
                }

                // Get items offered by each party
                const proposerItemIds = JSON.parse(trade.proposerItemIds || '[]');
                const receiverItemIds = JSON.parse(trade.receiverItemIds || '[]');
                const proposerCashOffer = trade.proposerCashOffer || 0;
                const receiverCashOffer = trade.receiverCashOffer || 0;

                // Calculate item values
                const getItemsValue = (itemIds: string[]): Promise<number> => {
                    if (itemIds.length === 0) return Promise.resolve(0);

                    return new Promise((res, rej) => {
                        const placeholders = itemIds.map(() => '?').join(',');
                        db.all(
                            `SELECT SUM(COALESCE(estimatedMarketValue, 0)) as total FROM Item WHERE id IN (${placeholders})`,
                            itemIds,
                            (err: Error | null, rows: any[]) => {
                                if (err) rej(err);
                                else res(rows?.[0]?.total || 0);
                            }
                        );
                    });
                };

                Promise.all([
                    getItemsValue(proposerItemIds),
                    getItemsValue(receiverItemIds)
                ]).then(([proposerItemValue, receiverItemValue]) => {
                    // Total value each side is offering
                    const proposerTotalValue = proposerItemValue + proposerCashOffer;
                    const receiverTotalValue = receiverItemValue + receiverCashOffer;

                    // Net difference
                    const difference = proposerTotalValue - receiverTotalValue;

                    if (Math.abs(difference) < 0.01) {
                        // Equal trade, no cash needed
                        resolve({
                            payerId: null,
                            recipientId: null,
                            amount: 0,
                            description: 'Equal trade - no cash differential',
                        });
                    } else if (difference > 0) {
                        // Proposer is offering more value, receiver owes cash
                        resolve({
                            payerId: trade.receiverId,
                            recipientId: trade.proposerId,
                            amount: Math.abs(difference),
                            description: `Receiver pays $${Math.abs(difference).toFixed(2)} to proposer`,
                        });
                    } else {
                        // Receiver is offering more value, proposer owes cash
                        resolve({
                            payerId: trade.proposerId,
                            recipientId: trade.receiverId,
                            amount: Math.abs(difference),
                            description: `Proposer pays $${Math.abs(difference).toFixed(2)} to receiver`,
                        });
                    }
                }).catch(reject);
            }
        );
    });
}

/**
 * Fund the escrow for a trade
 * Called when the payer clicks "Pay to Escrow"
 */
export async function fundEscrow(
    tradeId: string,
    payerId: number
): Promise<{ escrowHold: EscrowHold; requiresConfirmation: boolean }> {
    // Calculate what's owed
    const differential = await calculateCashDifferential(tradeId);

    if (differential.amount === 0) {
        throw new Error('No cash differential - escrow not needed');
    }

    if (differential.payerId !== payerId) {
        throw new Error(`User ${payerId} is not the payer for this trade`);
    }

    // Hold funds via payment provider
    const escrowHold = await paymentProvider.holdFunds(
        differential.amount,
        tradeId,
        differential.payerId,
        differential.recipientId!
    );

    // Update trade status
    await updateTradeStatus(tradeId, 'ESCROW_FUNDED');

    console.log(`[Escrow] Funded escrow for trade ${tradeId}: $${differential.amount}`);

    return {
        escrowHold,
        requiresConfirmation: false, // Mock provider doesn't require frontend confirmation
    };
}

/**
 * Release escrow to recipient
 * Called when both parties confirm receipt
 */
export async function releaseEscrow(tradeId: string): Promise<void> {
    const escrowHold = await paymentProvider.getEscrowHoldForTrade(tradeId);

    if (!escrowHold) {
        throw new Error(`No escrow hold found for trade: ${tradeId}`);
    }

    if (escrowHold.status !== EscrowStatus.FUNDED) {
        throw new Error(`Escrow is not in FUNDED state: ${escrowHold.status}`);
    }

    await paymentProvider.releaseFunds(escrowHold.id);

    console.log(`[Escrow] Released funds for trade ${tradeId} to user ${escrowHold.recipientId}`);
}

/**
 * Refund escrow to payer
 * Called on cancellation or dispute resolution in payer's favor
 */
export async function refundEscrow(tradeId: string, amount?: number): Promise<void> {
    const escrowHold = await paymentProvider.getEscrowHoldForTrade(tradeId);

    if (!escrowHold) {
        throw new Error(`No escrow hold found for trade: ${tradeId}`);
    }

    if (escrowHold.status !== EscrowStatus.FUNDED) {
        throw new Error(`Escrow is not in FUNDED state: ${escrowHold.status}`);
    }

    await paymentProvider.refundHeldFunds(escrowHold.id, amount);

    console.log(`[Escrow] Refunded funds for trade ${tradeId} to user ${escrowHold.payerId}`);
}

/**
 * Get escrow status for a trade
 */
export async function getEscrowStatus(tradeId: string): Promise<{
    hasEscrow: boolean;
    escrowHold: EscrowHold | null;
    cashDifferential: CashDifferential;
}> {
    const [escrowHold, cashDifferential] = await Promise.all([
        paymentProvider.getEscrowHoldForTrade(tradeId),
        calculateCashDifferential(tradeId),
    ]);

    return {
        hasEscrow: escrowHold !== null,
        escrowHold,
        cashDifferential,
    };
}

// Helper to update trade status
function updateTradeStatus(tradeId: string, status: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?`,
            [status, new Date().toISOString(), tradeId],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Export the provider for direct access if needed
export { paymentProvider };
