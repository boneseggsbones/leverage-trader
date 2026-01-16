import { db } from './database';

/**
 * Trade Price Signal Service
 * 
 * Generates price signals from completed trades to build historical market data.
 * These signals help establish market values for items based on actual trade activity.
 */

interface TradeRow {
    id: string;
    proposerId: string;
    receiverId: string;
    proposerItemIds: string;
    receiverItemIds: string;
    proposerCash: number;
    receiverCash: number;
    status: string;
    updatedAt: string;
}

interface ItemRow {
    id: number;
    name: string;
    estimatedMarketValue: number;
    condition: string | null;
    product_id: number | null;
    category_id: number | null;
}

interface PriceSignal {
    trade_id: string;
    item_id: number;
    product_id: number | null;
    category_id: number | null;
    item_name: string;
    condition: string | null;
    implied_value_cents: number;
    signal_confidence: number;
    trade_completed_at: string;
}

/**
 * Calculate confidence score for a price signal based on trade characteristics.
 * 
 * Factors that increase confidence:
 * - Item is linked to a product catalog entry
 * - Trade has minimal cash component relative to item values
 * - Fewer items in trade (more direct value comparison)
 * 
 * @param item The item being assessed
 * @param totalItems Total number of items in the trade
 * @param cashRatio Ratio of cash to total trade value
 * @returns Confidence score 0-100
 */
function calculateSignalConfidence(
    item: ItemRow,
    totalItems: number,
    cashRatio: number
): number {
    let confidence = 70; // Base confidence

    // Boost for product-linked items (verified identity)
    if (item.product_id) {
        confidence += 15;
    }

    // Penalty for high cash ratio (value less clear)
    if (cashRatio > 0.5) {
        confidence -= 10;
    } else if (cashRatio > 0.25) {
        confidence -= 5;
    }

    // Penalty for multi-item trades (value attribution less precise)
    if (totalItems > 4) {
        confidence -= 15;
    } else if (totalItems > 2) {
        confidence -= 10;
    }

    // Clamp to valid range
    return Math.max(0, Math.min(100, confidence));
}

/**
 * Generate price signals for all items in a completed trade.
 * 
 * Uses the trade equation to derive implied values:
 * Sum(proposerItems.EMV) + proposerCash = Sum(receiverItems.EMV) + receiverCash
 * 
 * For each item, we calculate what value it "traded for" based on the 
 * agreement between parties.
 * 
 * @param tradeId The ID of the completed trade
 * @returns Promise with success status and generated signals count
 */
export async function generatePriceSignalsForTrade(tradeId: string): Promise<{
    success: boolean;
    signalsGenerated: number;
    message: string;
}> {
    return new Promise((resolve) => {
        // Fetch the trade
        db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err: Error | null, trade: TradeRow | undefined) => {
            if (err || !trade) {
                resolve({
                    success: false,
                    signalsGenerated: 0,
                    message: err ? err.message : 'Trade not found'
                });
                return;
            }

            // Parse item IDs
            const proposerItemIds: number[] = JSON.parse(trade.proposerItemIds || '[]');
            const receiverItemIds: number[] = JSON.parse(trade.receiverItemIds || '[]');
            const allItemIds = [...proposerItemIds, ...receiverItemIds];

            if (allItemIds.length === 0) {
                resolve({
                    success: true,
                    signalsGenerated: 0,
                    message: 'No items in trade'
                });
                return;
            }

            // Fetch all items involved
            const placeholders = allItemIds.map(() => '?').join(',');
            db.all(
                `SELECT id, name, estimatedMarketValue, condition, product_id, category_id FROM Item WHERE id IN (${placeholders})`,
                allItemIds,
                (err2: Error | null, items: ItemRow[]) => {
                    if (err2) {
                        resolve({
                            success: false,
                            signalsGenerated: 0,
                            message: err2.message
                        });
                        return;
                    }

                    const itemMap = new Map<number, ItemRow>();
                    items.forEach(item => itemMap.set(item.id, item));

                    // Calculate total values for each side
                    const proposerItemValue = proposerItemIds.reduce((sum, id) => {
                        const item = itemMap.get(id);
                        return sum + (item?.estimatedMarketValue || 0);
                    }, 0);

                    const receiverItemValue = receiverItemIds.reduce((sum, id) => {
                        const item = itemMap.get(id);
                        return sum + (item?.estimatedMarketValue || 0);
                    }, 0);

                    const proposerCash = trade.proposerCash || 0;
                    const receiverCash = trade.receiverCash || 0;

                    // Total trade value (what each side is giving)
                    const proposerTotalValue = proposerItemValue + proposerCash;
                    const receiverTotalValue = receiverItemValue + receiverCash;

                    // Average of both sides as the "agreed" trade value
                    const agreedTradeValue = (proposerTotalValue + receiverTotalValue) / 2;

                    // Cash ratio for confidence calculation
                    const totalCash = proposerCash + receiverCash;
                    const cashRatio = agreedTradeValue > 0 ? totalCash / agreedTradeValue : 0;

                    const totalItems = allItemIds.length;
                    const tradeCompletedAt = trade.updatedAt || new Date().toISOString();

                    // Generate signals for each item
                    const signals: PriceSignal[] = [];

                    allItemIds.forEach(itemId => {
                        const item = itemMap.get(itemId);
                        if (!item) return;

                        // The item's implied value is its EMV (what it was "priced at" in the trade)
                        // We use the item's EMV as the implied value since both parties agreed to the trade
                        const impliedValue = item.estimatedMarketValue || 0;

                        const confidence = calculateSignalConfidence(item, totalItems, cashRatio);

                        signals.push({
                            trade_id: tradeId,
                            item_id: item.id,
                            product_id: item.product_id,
                            category_id: item.category_id,
                            item_name: item.name,
                            condition: item.condition,
                            implied_value_cents: impliedValue,
                            signal_confidence: confidence,
                            trade_completed_at: tradeCompletedAt
                        });
                    });

                    // Insert all signals
                    if (signals.length === 0) {
                        resolve({
                            success: true,
                            signalsGenerated: 0,
                            message: 'No signals to generate'
                        });
                        return;
                    }

                    const insertSql = `
            INSERT INTO trade_price_signals 
            (trade_id, item_id, product_id, category_id, item_name, condition, implied_value_cents, signal_confidence, trade_completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

                    let inserted = 0;
                    let errors = 0;

                    signals.forEach((signal, index) => {
                        db.run(
                            insertSql,
                            [
                                signal.trade_id,
                                signal.item_id,
                                signal.product_id,
                                signal.category_id,
                                signal.item_name,
                                signal.condition,
                                signal.implied_value_cents,
                                signal.signal_confidence,
                                signal.trade_completed_at
                            ],
                            (insertErr: Error | null) => {
                                if (insertErr) {
                                    console.error('Error inserting price signal:', insertErr);
                                    errors++;
                                } else {
                                    inserted++;
                                }

                                // Check if all done
                                if (index === signals.length - 1) {
                                    resolve({
                                        success: errors === 0,
                                        signalsGenerated: inserted,
                                        message: errors > 0
                                            ? `Generated ${inserted} signals with ${errors} errors`
                                            : `Successfully generated ${inserted} price signals`
                                    });
                                }
                            }
                        );
                    });
                }
            );
        });
    });
}

/**
 * Get all price signals for a specific item.
 * 
 * @param itemId The item ID to fetch signals for
 * @returns Promise with array of price signals
 */
export async function getPriceSignalsForItem(itemId: number): Promise<{
    signals: PriceSignal[];
    stats: {
        count: number;
        avgValueCents: number;
        minValueCents: number;
        maxValueCents: number;
        avgConfidence: number;
    } | null;
}> {
    return new Promise((resolve) => {
        db.all(
            `SELECT * FROM trade_price_signals WHERE item_id = ? ORDER BY trade_completed_at DESC`,
            [itemId],
            (err: Error | null, signals: PriceSignal[]) => {
                if (err || !signals || signals.length === 0) {
                    resolve({ signals: [], stats: null });
                    return;
                }

                const values = signals.map(s => s.implied_value_cents);
                const confidences = signals.map(s => s.signal_confidence);

                resolve({
                    signals,
                    stats: {
                        count: signals.length,
                        avgValueCents: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
                        minValueCents: Math.min(...values),
                        maxValueCents: Math.max(...values),
                        avgConfidence: Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
                    }
                });
            }
        );
    });
}
