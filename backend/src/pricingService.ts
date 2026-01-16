import { db } from './database';

// PriceCharting API configuration
const PRICECHARTING_BASE_URL = 'https://www.pricecharting.com';
const API_TOKEN = process.env.PRICECHARTING_API_TOKEN || '';

// API response types
interface PriceChartingProduct {
    status: string;
    id: string;
    'product-name': string;
    'console-name': string;
    'loose-price'?: number;
    'cib-price'?: number;
    'new-price'?: number;
    'graded-price'?: number;
    'release-date'?: string;
}

interface PriceChartingSearchResult {
    status: string;
    products: Array<{
        id: string;
        'product-name': string;
        'console-name': string;
    }>;
}

// Condition mapping from Leverage to PriceCharting price field
const CONDITION_TO_PRICE_FIELD: Record<string, keyof PriceChartingProduct> = {
    'LOOSE': 'loose-price',
    'CIB': 'cib-price',
    'NEW_SEALED': 'new-price',
    'GRADED': 'graded-price',
    'GOOD': 'loose-price', // Default mapping
    'OTHER': 'loose-price',
};

/**
 * Check if API is configured
 */
export const isApiConfigured = (): boolean => {
    return API_TOKEN.length === 40;
};

/**
 * Search PriceCharting catalog for products
 */
export const searchPriceChartingProducts = async (query: string): Promise<PriceChartingSearchResult['products']> => {
    if (!isApiConfigured()) {
        console.log('PriceCharting API not configured, skipping search');
        return [];
    }

    try {
        const url = `${PRICECHARTING_BASE_URL}/api/products?t=${API_TOKEN}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data: PriceChartingSearchResult = await response.json();

        if (data.status !== 'success') {
            console.error('PriceCharting API error:', data);
            return [];
        }

        return data.products || [];
    } catch (error) {
        console.error('Error searching PriceCharting:', error);
        return [];
    }
};

/**
 * Get full product pricing from PriceCharting
 */
export const getPriceChartingProduct = async (pricechartingId: string): Promise<PriceChartingProduct | null> => {
    if (!isApiConfigured()) {
        console.log('PriceCharting API not configured');
        return null;
    }

    try {
        const url = `${PRICECHARTING_BASE_URL}/api/product?t=${API_TOKEN}&id=${pricechartingId}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data: PriceChartingProduct = await response.json();

        if (data.status !== 'success') {
            console.error('PriceCharting API error:', data);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Error fetching PriceCharting product:', error);
        return null;
    }
};

/**
 * Refresh valuation for an item from external API
 * Returns the new EMV in cents, or null if refresh failed
 */
export const refreshItemValuation = async (itemId: number): Promise<{
    success: boolean;
    emvCents: number | null;
    source: string;
    confidence: number | null;
    message: string;
}> => {
    return new Promise((resolve) => {
        // Get the item and its product info
        db.get('SELECT i.*, pc.pricecharting_id FROM Item i LEFT JOIN product_catalog pc ON i.product_id = pc.id WHERE i.id = ?',
            [itemId], async (err: Error | null, item: any) => {
                if (err || !item) {
                    resolve({
                        success: false,
                        emvCents: null,
                        source: 'error',
                        confidence: null,
                        message: err ? err.message : 'Item not found'
                    });
                    return;
                }

                // Check for cached valuation that's still valid
                const now = new Date().toISOString();
                db.get(`SELECT * FROM api_valuations 
                        WHERE item_id = ? AND expires_at > ? 
                        ORDER BY fetched_at DESC LIMIT 1`,
                    [itemId, now], async (err2: Error | null, cached: any) => {
                        if (cached && !err2) {
                            // Return cached value
                            resolve({
                                success: true,
                                emvCents: cached.value_cents,
                                source: 'cached',
                                confidence: cached.confidence_score,
                                message: 'Using cached valuation'
                            });
                            return;
                        }

                        // Try to fetch from API if we have a pricecharting_id
                        if (item.pricecharting_id && isApiConfigured()) {
                            const product = await getPriceChartingProduct(item.pricecharting_id);

                            if (product) {
                                const condition = item.condition || 'GOOD';
                                const priceField = CONDITION_TO_PRICE_FIELD[condition] || 'loose-price';
                                const valueCents = product[priceField] as number || product['loose-price'] || 0;
                                const confidence = 85; // High confidence for API data

                                // Calculate expires_at (24 hours from now)
                                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                                // Store in api_valuations
                                db.run(`INSERT INTO api_valuations 
                                        (item_id, api_provider, api_item_id, condition_queried, value_cents, 
                                         confidence_score, raw_response, fetched_at, expires_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [itemId, 'pricecharting', item.pricecharting_id, condition, valueCents,
                                        confidence, JSON.stringify(product), now, expiresAt],
                                    (err3: Error | null) => {
                                        if (err3) {
                                            console.error('Error storing valuation:', err3);
                                        }
                                    });

                                // Update item EMV
                                db.run(`UPDATE Item SET estimatedMarketValue = ?, emv_source = 'api', 
                                        emv_confidence = ?, emv_updated_at = ? WHERE id = ?`,
                                    [valueCents, confidence, now, itemId],
                                    (err4: Error | null) => {
                                        if (err4) {
                                            console.error('Error updating item EMV:', err4);
                                        }
                                    });

                                resolve({
                                    success: true,
                                    emvCents: valueCents,
                                    source: 'api',
                                    confidence: confidence,
                                    message: `Updated from PriceCharting: ${product['product-name']}`
                                });
                                return;
                            }
                        }

                        // API not available or no pricecharting_id - return current value
                        resolve({
                            success: false,
                            emvCents: item.estimatedMarketValue || null,
                            source: item.emv_source || 'user_defined',
                            confidence: item.emv_confidence || null,
                            message: isApiConfigured()
                                ? 'No PriceCharting ID linked to this item'
                                : 'PriceCharting API not configured'
                        });
                    });
            });
    });
};

/**
 * Link an item to a PriceCharting product
 */
export const linkItemToProduct = async (
    itemId: number,
    pricechartingId: string,
    productName: string,
    consoleName: string
): Promise<{ success: boolean; productId: number | null; message: string }> => {
    return new Promise((resolve) => {
        // First, check if this product already exists in our catalog
        db.get('SELECT id FROM product_catalog WHERE pricecharting_id = ?',
            [pricechartingId], (err: Error | null, existing: any) => {
                if (existing) {
                    // Product exists, just link the item
                    db.run('UPDATE Item SET product_id = ? WHERE id = ?',
                        [existing.id, itemId], (err2: Error | null) => {
                            if (err2) {
                                resolve({ success: false, productId: null, message: err2.message });
                            } else {
                                resolve({ success: true, productId: existing.id, message: 'Linked to existing product' });
                            }
                        });
                } else {
                    // Create new product in catalog
                    db.run(`INSERT INTO product_catalog (pricecharting_id, name, brand, model, created_at)
                            VALUES (?, ?, ?, ?, ?)`,
                        [pricechartingId, productName, consoleName, null, new Date().toISOString()],
                        function (this: any, err3: Error | null) {
                            if (err3) {
                                resolve({ success: false, productId: null, message: err3.message });
                                return;
                            }
                            const productId = this.lastID;

                            // Link item to new product
                            db.run('UPDATE Item SET product_id = ? WHERE id = ?',
                                [productId, itemId], (err4: Error | null) => {
                                    if (err4) {
                                        resolve({ success: false, productId: null, message: err4.message });
                                    } else {
                                        resolve({ success: true, productId, message: 'Created and linked to new product' });
                                    }
                                });
                        });
                }
            });
    });
};
