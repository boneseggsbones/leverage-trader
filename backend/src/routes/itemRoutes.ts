import { Router } from 'express';
import type { RunResult } from 'sqlite3';
import { db } from '../database';
import { upload } from '../middleware/uploadMiddleware';
import { refreshItemValuation, linkItemToProduct, isApiConfigured, getConsolidatedValuation } from '../pricingService';
import { getPriceSignalsForItem } from '../priceSignalService';
import { watchItem, unwatchItem, isWatching, getWatchCount } from '../watchlistService';
import { linkItemToPSA, getItemPSAData } from '../psaService';

const router = Router();

// =====================================================
// ITEM CRUD
// =====================================================

// Get all items (or for a specific user)
router.get('/', (req, res) => {
    const { userId } = req.query;
    console.log('GET /api/items called with userId=', userId);
    if (userId) {
        db.all('SELECT * FROM Item WHERE owner_id = ?', [userId], (err: Error | null, rows: any[]) => {
            if (err) {
                console.error('DB error fetching items for user', userId, err);
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        });
        return;
    }

    // No userId provided: return all items
    db.all('SELECT * FROM Item', [], (err: Error | null, rows: any[]) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Create a new item
router.post('/', upload.single('image'), (req, res) => {
    const { name, description, owner_id } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name || !description || !owner_id) {
        return res.status(400).json({ error: 'name, description, and owner_id are required' });
    }
    const estimatedMarketValue = req.body.estimatedMarketValue ? parseInt(req.body.estimatedMarketValue, 10) : 0;
    db.run('INSERT INTO Item (name, description, owner_id, estimatedMarketValue, imageUrl) VALUES (?, ?, ?, ?, ?)', [name, description, owner_id, estimatedMarketValue, imageUrl], function (this: RunResult, err: Error | null) {
        if (err) {
            console.error('Error inserting item:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ id: this.lastID });
    });
});

// Update an item
router.put('/:id', upload.single('image'), (req, res) => {
    const { name, description } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    if (!name || !description) {
        return res.status(400).json({ error: 'name and description are required' });
    }

    const estimatedMarketValue = req.body.estimatedMarketValue ? parseInt(req.body.estimatedMarketValue, 10) : undefined;

    let query = 'UPDATE Item SET name = ?, description = ?';
    const params: any[] = [name, description];

    if (typeof estimatedMarketValue === 'number') {
        query += ', estimatedMarketValue = ?';
        params.push(estimatedMarketValue);
    }

    if (imageUrl) {
        query += ', imageUrl = ?';
        params.push(imageUrl);
    }

    query += ' WHERE id = ?';
    params.push(req.params.id);

    db.run(query, params, function (this: RunResult, err: Error | null) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ changes: this.changes });
    });
});

// Delete an item
router.delete('/:id', (req, res) => {
    db.run('DELETE FROM Item WHERE id = ?', [req.params.id], function (this: RunResult, err: Error | null) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ changes: this.changes });
    });
});

// =====================================================
// VALUATIONS
// =====================================================

// Get all valuation sources for an item
router.get('/:id/valuations', (req, res) => {
    const itemId = req.params.id;

    // Get the item first
    db.get('SELECT * FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Get API valuations
        db.all('SELECT * FROM api_valuations WHERE item_id = ? OR product_id = ? ORDER BY fetched_at DESC',
            [itemId, item.product_id], (err2: Error | null, apiValuations: any[]) => {
                if (err2) return res.status(500).json({ error: err2.message });

                // Get user overrides
                db.all('SELECT * FROM user_value_overrides WHERE item_id = ? ORDER BY created_at DESC',
                    [itemId], (err3: Error | null, userOverrides: any[]) => {
                        if (err3) return res.status(500).json({ error: err3.message });

                        // Get condition assessment
                        db.get('SELECT * FROM condition_assessments WHERE item_id = ? ORDER BY assessed_at DESC LIMIT 1',
                            [itemId], (err4: Error | null, condition: any) => {
                                if (err4) return res.status(500).json({ error: err4.message });

                                res.json({
                                    item: {
                                        id: item.id,
                                        name: item.name,
                                        current_emv_cents: item.estimatedMarketValue,
                                        emv_source: item.emv_source,
                                        emv_confidence: item.emv_confidence,
                                        condition: item.condition,
                                        category_id: item.category_id,
                                        psa_cert_number: item.psa_cert_number,
                                        psa_grade: item.psa_grade,
                                    },
                                    apiValuations: apiValuations || [],
                                    userOverrides: userOverrides || [],
                                    conditionAssessment: condition || null,
                                });
                            });
                    });
            });
    });
});

// Submit user value override
router.post('/:id/valuations/override', (req, res) => {
    const itemId = req.params.id;
    const { userId, overrideValueCents, reason, justification } = req.body;

    if (!userId || !overrideValueCents) {
        return res.status(400).json({ error: 'userId and overrideValueCents are required' });
    }

    // First get current item value to store as original
    db.get('SELECT estimatedMarketValue FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        const originalValue = item.estimatedMarketValue;

        // Insert the override record
        db.run(`INSERT INTO user_value_overrides (item_id, user_id, override_value_cents, original_api_value_cents, reason, justification, status)
            VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
            [itemId, userId, overrideValueCents, originalValue, reason || null, justification || null],
            function (this: RunResult, err2: Error | null) {
                if (err2) {
                    return res.status(500).json({ error: err2.message });
                }

                // Also update the Item's actual EMV and store original value
                db.run(`UPDATE Item SET 
                estimatedMarketValue = ?, 
                emv_source = 'user_override',
                emv_confidence = 100,
                original_api_value_cents = COALESCE(original_api_value_cents, ?)
                WHERE id = ?`,
                    [overrideValueCents, originalValue, itemId],
                    (err3: Error | null) => {
                        if (err3) {
                            return res.status(500).json({ error: err3.message });
                        }
                        res.json({
                            id: this.lastID,
                            status: 'approved',
                            originalValue,
                            newValue: overrideValueCents
                        });
                    });
            });
    });
});

// Get historical trade prices for similar items
router.get('/:id/similar-prices', (req, res) => {
    const itemId = req.params.id;

    // Get the item to find its product/category
    db.get('SELECT * FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Find similar trade price signals
        let query = `
      SELECT tps.*, 
             CASE WHEN tps.product_id = ? THEN 1.0 ELSE 0.7 END as relevance
      FROM trade_price_signals tps
      WHERE (tps.product_id = ? OR tps.category_id = ?)
        AND tps.implied_value_cents BETWEEN ? AND ?
      ORDER BY relevance DESC, trade_completed_at DESC
      LIMIT 20
    `;

        const emv = item.estimatedMarketValue || 10000; // Default to $100 if no EMV
        db.all(query, [
            item.product_id,
            item.product_id,
            item.category_id,
            Math.floor(emv * 0.5),
            Math.floor(emv * 1.5)
        ], (err2: Error | null, signals: any[]) => {
            if (err2) return res.status(500).json({ error: err2.message });

            // Calculate aggregate stats
            const prices = (signals || []).map(s => s.implied_value_cents);
            const stats = prices.length > 0 ? {
                count: prices.length,
                avgPriceCents: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
                minPriceCents: Math.min(...prices),
                maxPriceCents: Math.max(...prices),
            } : null;

            res.json({
                item: { id: item.id, name: item.name, product_id: item.product_id, category_id: item.category_id },
                signals: signals || [],
                stats,
            });
        });
    });
});

// Get price signals for an item
router.get('/:id/price-signals', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
    }

    try {
        const result = await getPriceSignalsForItem(itemId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Refresh item valuation from external API
router.post('/:id/refresh-valuation', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);

    try {
        const result = await refreshItemValuation(itemId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to refresh valuation'
        });
    }
});

// Link an item to an external product
router.post('/:id/link-product', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const { pricechartingId, productName, consoleName } = req.body;

    if (!pricechartingId) {
        return res.status(400).json({ success: false, message: 'pricechartingId is required' });
    }

    try {
        const result = await linkItemToProduct(itemId, pricechartingId, productName, consoleName);

        if (result.success) {
            // Immediately refresh the valuation after linking
            const valuationResult = await refreshItemValuation(itemId);
            res.json({ ...result, valuation: valuationResult });
        } else {
            res.json(result);
        }
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get consolidated valuation from multiple sources
router.get('/:id/consolidated-valuation', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ success: false, message: 'Invalid item ID' });
    }

    try {
        const result = await getConsolidatedValuation(itemId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({
            success: false,
            consolidated: null,
            message: error.message || 'Failed to get consolidated valuation'
        });
    }
});

// =====================================================
// WATCHLIST
// =====================================================

// Watch a specific item
router.post('/:id/watch', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const { userId } = req.body;
    if (isNaN(itemId) || !userId) {
        return res.status(400).json({ error: 'Invalid item ID or missing userId' });
    }
    try {
        const watch = await watchItem(Number(userId), itemId);
        res.json({ watch });
    } catch (err: any) {
        if (err.message === 'Cannot watch your own item') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// Unwatch a specific item
router.delete('/:id/watch', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const { userId } = req.body;
    if (isNaN(itemId) || !userId) {
        return res.status(400).json({ error: 'Invalid item ID or missing userId' });
    }
    try {
        const removed = await unwatchItem(Number(userId), itemId);
        res.json({ success: removed });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Check if user is watching an item
router.get('/:id/watching', async (req, res) => {
    const itemId = parseInt(req.params.id, 10);
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : null;
    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
    }
    try {
        const [watchCountResult, isUserWatching] = await Promise.all([
            getWatchCount(itemId),
            userId ? isWatching(userId, itemId) : Promise.resolve(false)
        ]);
        res.json({ watchCount: watchCountResult, isWatching: isUserWatching });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// PSA INTEGRATION
// =====================================================

// Link an item to a PSA certification
router.post('/:itemId/link-psa', async (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);
    const { certNumber } = req.body;

    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
    }

    if (!certNumber || certNumber.length < 5) {
        return res.status(400).json({ error: 'Valid cert number required' });
    }

    try {
        const result = await linkItemToPSA(itemId, certNumber);
        res.json(result);
    } catch (err: any) {
        console.error('[PSA] Link error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get PSA data for an item
router.get('/:itemId/psa', async (req, res) => {
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Invalid item ID' });
    }

    try {
        const psaData = await getItemPSAData(itemId);

        if (!psaData) {
            return res.status(404).json({ error: 'No PSA data linked to this item' });
        }

        res.json(psaData);
    } catch (err: any) {
        console.error('[PSA] Get data error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
