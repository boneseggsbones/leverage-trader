import { db, recordApiCall, logApiCall } from './database';
import { getEbayPricing, isEbayConfigured, EbayPriceData } from './ebayService';
import { getEbaySoldPrice, isRapidApiConfigured, optimizeQueryForEbay } from './rapidApiEbayService';
import { searchTcgCards, isJustTcgConfigured, isTcgItem, TcgPriceData } from './justTcgService';
import { searchSneakers, isStockxConfigured, isSneakerItem, SneakerPriceData } from './stockxService';

// === Consolidated Pricing Types ===

export interface PriceSource {
    provider: 'pricecharting' | 'ebay' | 'rapidapi_ebay' | 'justtcg' | 'stockx';
    price: number;          // in cents
    weight: number;         // 0-1
    confidence: number;     // 0-100
    dataPoints: number;     // Number of sales/data points
    lastUpdated: Date;
}

export interface ConsolidatedPrice {
    consolidatedValue: number;      // Weighted average in cents
    confidence: number;             // 0-100
    sources: PriceSource[];
    trend: 'up' | 'down' | 'stable';
    volatility: 'low' | 'medium' | 'high';
    priceRange?: {
        low: number;                // Minimum across sources (in cents)
        high: number;               // Maximum across sources (in cents)
        display: string;            // Formatted display string, e.g. "$45 - $55"
    };
}

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
        'loose-price'?: number;
        'cib-price'?: number;
        'new-price'?: number;
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
 * Refresh valuation for an item from external API(s)
 * Uses consolidated pricing (PriceCharting + eBay) when eBay is configured
 * Returns the new EMV in cents with source breakdown
 */
export const refreshItemValuation = async (itemId: number): Promise<{
    success: boolean;
    emvCents: number | null;
    source: string;
    confidence: number | null;
    message: string;
    sources?: PriceSource[];
    trend?: 'up' | 'down' | 'stable';
    volatility?: 'low' | 'medium' | 'high';
}> => {
    // If eBay is configured, use consolidated pricing from multiple sources
    if (isEbayConfigured()) {
        const consolidated = await getConsolidatedValuation(itemId);
        if (consolidated.success && consolidated.consolidated) {
            return {
                success: true,
                emvCents: consolidated.consolidated.consolidatedValue,
                source: 'consolidated',
                confidence: consolidated.consolidated.confidence,
                message: consolidated.message,
                sources: consolidated.consolidated.sources,
                trend: consolidated.consolidated.trend,
                volatility: consolidated.consolidated.volatility
            };
        }
        // If consolidated failed, fall through to PriceCharting-only
    }

    // PriceCharting-only pricing (fallback or when eBay not configured)
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
                            // Also update the Item to reflect the cached valuation
                            db.run(`UPDATE Item SET estimatedMarketValue = ?, emv_source = 'api', 
                                    emv_confidence = ?, emv_updated_at = ? WHERE id = ? AND (emv_source IS NULL OR emv_source != 'api')`,
                                [cached.value_cents, cached.confidence_score, now, itemId]);

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
                                    message: `Updated from PriceCharting: ${product['product-name']}`,
                                    sources: [{
                                        provider: 'pricecharting',
                                        price: valueCents,
                                        weight: 1,
                                        confidence: 85,
                                        dataPoints: 1,
                                        lastUpdated: new Date()
                                    }]
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
        // First, clear any existing cached valuations for this item (stale cache from old product)
        db.run('DELETE FROM api_valuations WHERE item_id = ?', [itemId], () => {
            // Then check if this product already exists in our catalog
            db.get('SELECT id FROM product_catalog WHERE pricecharting_id = ?',
                [pricechartingId], (err: Error | null, existing: any) => {
                    if (existing) {
                        // Product exists, just link the item and clear any user override
                        // Also rename the item to the product name for clarity
                        db.run(`UPDATE Item SET 
                                name = ?,
                                product_id = ?, 
                                emv_source = NULL,
                                linked_product_name = ?
                                WHERE id = ?`,
                            [productName, existing.id, productName, itemId], (err2: Error | null) => {
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

                                // Link item to new product and clear any user override
                                // Also rename the item to the product name
                                db.run(`UPDATE Item SET 
                                        name = ?,
                                        product_id = ?, 
                                        emv_source = NULL,
                                        linked_product_name = ?
                                        WHERE id = ?`,
                                    [productName, productId, productName, itemId], (err4: Error | null) => {
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
    });
};

/**
 * Get consolidated valuation from multiple sources (PriceCharting + eBay)
 * Returns a weighted average with confidence score and trend analysis
 */
export const getConsolidatedValuation = async (itemId: number): Promise<{
    success: boolean;
    consolidated: ConsolidatedPrice | null;
    message: string;
}> => {
    return new Promise((resolve) => {
        // Get item with product info
        db.get(`SELECT i.*, pc.pricecharting_id, pc.name as product_name 
                FROM Item i 
                LEFT JOIN product_catalog pc ON i.product_id = pc.id 
                WHERE i.id = ?`,
            [itemId], async (err: Error | null, item: any) => {
                if (err || !item) {
                    return resolve({
                        success: false,
                        consolidated: null,
                        message: err?.message || 'Item not found'
                    });
                }

                const sources: PriceSource[] = [];
                const now = new Date();
                const searchQuery = item.product_name || item.name;
                const condition = item.condition || 'GOOD';

                // ===== RUN ALL API CALLS IN PARALLEL =====
                // This reduces total time from sum of all calls to max of any single call

                const apiPromises: Array<{ name: string; promise: Promise<any> }> = [];

                // PriceCharting (only if linked)
                if (item.pricecharting_id && isApiConfigured()) {
                    apiPromises.push({
                        name: 'pricecharting',
                        promise: getPriceChartingProduct(item.pricecharting_id).catch(e => {
                            console.error('PriceCharting fetch error:', e);
                            return null;
                        })
                    });
                }

                // eBay Marketplace Insights
                if (isEbayConfigured() && searchQuery) {
                    apiPromises.push({
                        name: 'ebay',
                        promise: getEbayPricing(searchQuery, { condition }).catch(e => {
                            console.error('eBay fetch error:', e);
                            return null;
                        })
                    });
                }

                // RapidAPI eBay (sold listings)
                if (isRapidApiConfigured() && searchQuery) {
                    const optimizedQuery = optimizeQueryForEbay(searchQuery, item.category);
                    apiPromises.push({
                        name: 'rapidapi_ebay',
                        promise: getEbaySoldPrice(optimizedQuery, {
                            excludeKeywords: 'lot bundle broken parts',
                            maxResults: 50
                        }).catch(e => {
                            console.error('RapidAPI eBay fetch error:', e);
                            return null;
                        })
                    });
                }

                // JustTCG (for trading cards)
                if (isJustTcgConfigured() && searchQuery && isTcgItem(searchQuery, item.category)) {
                    apiPromises.push({
                        name: 'justtcg',
                        promise: searchTcgCards(searchQuery, { limit: 5 }).catch(e => {
                            console.error('JustTCG fetch error:', e);
                            return [];
                        })
                    });
                }

                // StockX (for sneakers)
                if (isStockxConfigured() && searchQuery && isSneakerItem(searchQuery, item.category)) {
                    apiPromises.push({
                        name: 'stockx',
                        promise: searchSneakers(searchQuery, { limit: 5 }).catch(e => {
                            console.error('StockX fetch error:', e);
                            return [];
                        })
                    });
                }

                console.log(`[Pricing] Fetching from ${apiPromises.length} sources in parallel...`);
                const startTime = Date.now();

                // Execute all API calls in parallel
                const results = await Promise.all(apiPromises.map(p => p.promise));

                console.log(`[Pricing] All sources responded in ${Date.now() - startTime}ms`);
                const totalDurationMs = Date.now() - startTime;

                // Process results and track API calls
                results.forEach((result, index) => {
                    const sourceName = apiPromises[index].name;

                    // Track the API call
                    const apiNameMap: Record<string, string> = {
                        'pricecharting': 'PriceCharting',
                        'ebay': 'eBay (Official)',
                        'rapidapi_ebay': 'RapidAPI eBay',
                        'justtcg': 'JustTCG',
                        'stockx': 'StockX'
                    };
                    const apiDisplayName = apiNameMap[sourceName] || sourceName;
                    recordApiCall(apiDisplayName, result === null ? 'API returned null' : undefined);

                    if (sourceName === 'pricecharting' && result) {
                        const priceField = CONDITION_TO_PRICE_FIELD[condition] || 'loose-price';
                        const valueCents = (result[priceField] as number) || (result['loose-price'] as number) || 0;

                        // Log detailed call
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Product ID: ${item.pricecharting_id}`,
                            responseSummary: valueCents > 0 ? `Found ${priceField}: $${(valueCents / 100).toFixed(2)}` : 'No price found',
                            priceReturned: valueCents,
                            success: valueCents > 0,
                            durationMs: totalDurationMs
                        });

                        if (valueCents > 0) {
                            sources.push({
                                provider: 'pricecharting',
                                price: valueCents,
                                weight: 0.4,
                                confidence: 85,
                                dataPoints: 1,
                                lastUpdated: now
                            });
                        }
                    } else if (sourceName === 'pricecharting') {
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Product ID: ${item.pricecharting_id}`,
                            responseSummary: 'No response',
                            success: false,
                            errorMessage: 'API returned null',
                            durationMs: totalDurationMs
                        });
                    }

                    // eBay Official
                    if (sourceName === 'ebay' && result && result.sampleSize > 0) {
                        const ebayWeight = result.sampleSize >= 5 ? 0.6 : 0.4;
                        const ebayConfidence = Math.min(95, 60 + (result.sampleSize * 3));

                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Search: "${searchQuery}" (condition: ${condition})`,
                            responseSummary: `Found ${result.sampleSize} listings, avg: $${(result.averagePrice / 100).toFixed(2)}`,
                            priceReturned: result.averagePrice,
                            success: true,
                            durationMs: totalDurationMs
                        });

                        sources.push({
                            provider: 'ebay',
                            price: result.averagePrice,
                            weight: ebayWeight,
                            confidence: ebayConfidence,
                            dataPoints: result.sampleSize,
                            lastUpdated: result.lastUpdated
                        });
                    } else if (sourceName === 'ebay') {
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Search: "${searchQuery}" (condition: ${condition})`,
                            responseSummary: result ? 'No matching listings found' : 'No response',
                            success: false,
                            errorMessage: result === null ? 'API returned null' : 'No listings found',
                            durationMs: totalDurationMs
                        });
                    }

                    // RapidAPI eBay
                    if (sourceName === 'rapidapi_ebay' && result && result.sampleSize > 0) {
                        const rapidWeight = result.sampleSize >= 10 ? 0.5 :
                            result.sampleSize >= 5 ? 0.4 : 0.3;
                        const rapidConfidence = Math.min(90, 50 + (result.sampleSize * 2));

                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Search: "${searchQuery}"`,
                            responseSummary: `Found ${result.sampleSize} sold items, avg: $${(result.averagePrice / 100).toFixed(2)}`,
                            priceReturned: result.averagePrice,
                            success: true,
                            durationMs: totalDurationMs
                        });

                        sources.push({
                            provider: 'rapidapi_ebay',
                            price: result.averagePrice,
                            weight: rapidWeight,
                            confidence: rapidConfidence,
                            dataPoints: result.sampleSize,
                            lastUpdated: result.lastUpdated
                        });
                    } else if (sourceName === 'rapidapi_ebay') {
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Search: "${searchQuery}"`,
                            responseSummary: result ? 'No sold items found' : 'No response',
                            success: false,
                            errorMessage: result === null ? 'API returned null' : 'No sold items found',
                            durationMs: totalDurationMs
                        });
                    }

                    // JustTCG
                    if (sourceName === 'justtcg' && Array.isArray(result) && result.length > 0) {
                        const bestMatch = result[0];

                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Card search: "${searchQuery}"`,
                            responseSummary: `Found ${result.length} cards, best: ${bestMatch.name} @ $${(bestMatch.marketPrice / 100).toFixed(2)}`,
                            priceReturned: bestMatch.marketPrice,
                            success: true,
                            durationMs: totalDurationMs
                        });

                        sources.push({
                            provider: 'justtcg',
                            price: bestMatch.marketPrice,
                            weight: 0.7,
                            confidence: 90,
                            dataPoints: 1,
                            lastUpdated: bestMatch.lastUpdated
                        });
                    } else if (sourceName === 'justtcg') {
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Card search: "${searchQuery}"`,
                            responseSummary: 'No matching cards found',
                            success: false,
                            errorMessage: Array.isArray(result) ? 'No cards matched' : 'API returned null',
                            durationMs: totalDurationMs
                        });
                    }

                    // StockX
                    if (sourceName === 'stockx' && Array.isArray(result) && result.length > 0) {
                        const bestMatch = result[0];

                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Sneaker search: "${searchQuery}"`,
                            responseSummary: `Found ${result.length} sneakers, best: ${bestMatch.name} @ $${(bestMatch.lastSale / 100).toFixed(2)}`,
                            priceReturned: bestMatch.lastSale,
                            success: true,
                            durationMs: totalDurationMs
                        });

                        sources.push({
                            provider: 'stockx',
                            price: bestMatch.lastSale,
                            weight: 0.8,
                            confidence: 95,
                            dataPoints: 1,
                            lastUpdated: bestMatch.lastUpdated
                        });
                    } else if (sourceName === 'stockx') {
                        logApiCall({
                            apiName: apiDisplayName,
                            itemName: searchQuery,
                            requestQuery: `Sneaker search: "${searchQuery}"`,
                            responseSummary: 'No matching sneakers found',
                            success: false,
                            errorMessage: Array.isArray(result) ? 'No sneakers matched' : 'API returned null',
                            durationMs: totalDurationMs
                        });
                    }
                });

                // If no sources, return current item value
                if (sources.length === 0) {
                    return resolve({
                        success: false,
                        consolidated: null,
                        message: 'No pricing sources available'
                    });
                }

                // Normalize weights to sum to 1
                const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
                sources.forEach(s => s.weight = s.weight / totalWeight);

                // Calculate weighted average
                const consolidatedValue = Math.round(
                    sources.reduce((sum, s) => sum + (s.price * s.weight), 0)
                );

                // Calculate overall confidence (weighted average of source confidences)
                const confidence = Math.round(
                    sources.reduce((sum, s) => sum + (s.confidence * s.weight), 0)
                );

                // Determine trend from eBay data if available
                const ebaySource = sources.find(s => s.provider === 'ebay');
                let trend: 'up' | 'down' | 'stable' = 'stable';
                let volatility: 'low' | 'medium' | 'high' = 'low';

                if (ebaySource) {
                    // Re-fetch eBay data for trend/volatility (they're in the original data)
                    const ebayData = await getEbayPricing(searchQuery, { condition });
                    if (ebayData) {
                        trend = ebayData.trend;
                        volatility = ebayData.volatility;
                    }
                }

                // Cache the consolidated result
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                db.run(`INSERT INTO api_valuations 
                        (item_id, api_provider, value_cents, confidence_score, sample_size, 
                         raw_response, fetched_at, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [itemId, 'consolidated', consolidatedValue, confidence,
                        sources.reduce((sum, s) => sum + s.dataPoints, 0),
                        JSON.stringify({ sources, trend, volatility }),
                        now.toISOString(), expiresAt]);

                // Update item EMV with consolidated value
                db.run(`UPDATE Item SET estimatedMarketValue = ?, emv_source = 'consolidated', 
                        emv_confidence = ?, emv_updated_at = ? WHERE id = ?`,
                    [consolidatedValue, confidence, now.toISOString(), itemId]);

                // Calculate price range from all sources
                const allPrices = sources.map(s => s.price);
                const minPrice = Math.min(...allPrices);
                const maxPrice = Math.max(...allPrices);
                const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

                const priceRange = minPrice !== maxPrice ? {
                    low: minPrice,
                    high: maxPrice,
                    display: `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`
                } : undefined;

                resolve({
                    success: true,
                    consolidated: {
                        consolidatedValue,
                        confidence,
                        sources,
                        trend,
                        volatility,
                        priceRange
                    },
                    message: `Consolidated from ${sources.length} source(s)`
                });
            });
    });
};
