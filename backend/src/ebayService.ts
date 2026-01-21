/**
 * eBay Marketplace Insights API Service
 * 
 * Provides access to eBay's sold item data for multi-source pricing.
 * Uses OAuth 2.0 Client Credentials flow for app authentication.
 * Uses OAuth 2.0 Authorization Code flow for user authentication (inventory import).
 */

import { db } from './database';

// === Types ===

export interface EbaySoldItem {
    itemId: string;
    title: string;
    soldPrice: number;          // in cents
    soldDate: Date;
    condition: string;
    conditionId: string;
    buyingFormat: 'AUCTION' | 'FIXED_PRICE';
    categoryId: string;
    imageUrl?: string;
}

export interface EbayPriceData {
    averagePrice: number;           // 30-day average in cents
    medianPrice: number;            // in cents
    priceRange: { min: number; max: number };
    sampleSize: number;             // Number of sales analyzed
    trend: 'up' | 'down' | 'stable';
    volatility: 'low' | 'medium' | 'high';
    lastUpdated: Date;
}

// User OAuth token (stored in database)
export interface EbayUserToken {
    userId: number;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    ebayUserId?: string;
}

// eBay listing from Inventory API
export interface EbayListing {
    itemId: string;
    sku: string;
    title: string;
    description: string;
    condition: string;
    conditionDescription?: string;
    price: number;              // in cents
    quantity: number;
    imageUrls: string[];
    categoryId: string;
    categoryName: string;
    listingStatus: 'ACTIVE' | 'OUT_OF_STOCK' | 'INACTIVE';
}

interface OAuthToken {
    accessToken: string;
    expiresAt: Date;
}

interface EbaySearchResponse {
    itemSales: Array<{
        itemId: string;
        title: string;
        price: { value: string; currency: string };
        lastSoldDate: string;
        condition: string;
        conditionId: string;
        buyingOptions: string[];
        categories: Array<{ categoryId: string; categoryName: string }>;
        image?: { imageUrl: string };
    }>;
    total: number;
    limit: number;
    offset: number;
}

// === Configuration ===

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_API_BASE = 'https://api.ebay.com/buy/marketplace_insights/v1_beta';
const EBAY_INVENTORY_API = 'https://api.ebay.com/sell/inventory/v1';
const EBAY_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';

const EBAY_SANDBOX_OAUTH_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_API_BASE = 'https://api.sandbox.ebay.com/buy/marketplace_insights/v1_beta';
const EBAY_SANDBOX_INVENTORY_API = 'https://api.sandbox.ebay.com/sell/inventory/v1';
const EBAY_SANDBOX_AUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize';

const APP_ID = process.env.EBAY_APP_ID || '';
const CERT_ID = process.env.EBAY_CERT_ID || '';
const ENVIRONMENT = process.env.EBAY_ENVIRONMENT || 'SANDBOX';
const REDIRECT_URI = process.env.EBAY_REDIRECT_URI || 'http://localhost:3000/ebay/callback';
const RU_NAME = process.env.EBAY_RU_NAME || '';

// User OAuth scope for reading inventory
const USER_SCOPES = 'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly';

// Token cache (in-memory, refresh when expired)
let cachedToken: OAuthToken | null = null;


// === Helper Functions ===

/**
 * Check if eBay API is configured
 */
export const isEbayConfigured = (): boolean => {
    return APP_ID.length > 0 && CERT_ID.length > 0;
};

/**
 * Get the appropriate URL based on environment
 */
const getUrls = () => {
    const isSandbox = ENVIRONMENT === 'SANDBOX';
    return {
        oauth: isSandbox ? EBAY_SANDBOX_OAUTH_URL : EBAY_OAUTH_URL,
        api: isSandbox ? EBAY_SANDBOX_API_BASE : EBAY_API_BASE,
    };
};

/**
 * Get OAuth 2.0 Application Token
 * Uses Client Credentials grant (no user login required)
 */
export const getOAuthToken = async (): Promise<string | null> => {
    // Return cached token if still valid (with 5 min buffer)
    if (cachedToken && cachedToken.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
        return cachedToken.accessToken;
    }

    if (!isEbayConfigured()) {
        console.log('eBay API not configured');
        return null;
    }

    const urls = getUrls();
    const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString('base64');

    try {
        const response = await fetch(urls.oauth, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`,
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('eBay OAuth error:', response.status, errorText);
            return null;
        }

        const data = await response.json();

        // Cache the token
        cachedToken = {
            accessToken: data.access_token,
            expiresAt: new Date(Date.now() + (data.expires_in * 1000)),
        };

        console.log('eBay OAuth token obtained, expires:', cachedToken.expiresAt);
        return cachedToken.accessToken;
    } catch (error) {
        console.error('Error getting eBay OAuth token:', error);
        return null;
    }
};

// === Core API Functions ===

/**
 * Search eBay sold/completed listings
 * Returns recent sales data for price analysis
 */
export const searchSoldItems = async (
    query: string,
    options: {
        categoryId?: string;
        condition?: string;
        limit?: number;
    } = {}
): Promise<EbaySoldItem[]> => {
    const token = await getOAuthToken();
    if (!token) {
        console.log('No eBay token available, skipping search');
        return [];
    }

    const urls = getUrls();
    const { categoryId, condition, limit = 50 } = options;

    // Build filter string
    const filters: string[] = [];
    if (categoryId) {
        filters.push(`categoryIds:{${categoryId}}`);
    }
    if (condition) {
        // Map our conditions to eBay condition IDs
        const conditionMap: Record<string, string> = {
            'NEW_SEALED': '1000',   // New
            'CIB': '3000',          // Used
            'LOOSE': '3000',        // Used
            'GOOD': '3000',         // Used
            'GRADED': '2750',       // Like New
        };
        const ebayCondition = conditionMap[condition] || '3000';
        filters.push(`conditions:{${ebayCondition}}`);
    }

    const filterParam = filters.length > 0 ? `&filter=${filters.join(',')}` : '';
    const url = `${urls.api}/item_sales/search?q=${encodeURIComponent(query)}&limit=${limit}${filterParam}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('eBay search error:', response.status, errorText);
            return [];
        }

        const data: EbaySearchResponse = await response.json();

        if (!data.itemSales || data.itemSales.length === 0) {
            return [];
        }

        // Transform to our format
        return data.itemSales.map(item => ({
            itemId: item.itemId,
            title: item.title,
            soldPrice: Math.round(parseFloat(item.price.value) * 100), // Convert to cents
            soldDate: new Date(item.lastSoldDate),
            condition: item.condition,
            conditionId: item.conditionId,
            buyingFormat: item.buyingOptions.includes('AUCTION') ? 'AUCTION' : 'FIXED_PRICE',
            categoryId: item.categories?.[0]?.categoryId || '',
            imageUrl: item.image?.imageUrl,
        }));
    } catch (error) {
        console.error('Error searching eBay sold items:', error);
        return [];
    }
};

/**
 * Calculate price statistics from sold items
 * Computes averages, median, trend, and volatility
 */
export const calculatePriceStats = (items: EbaySoldItem[]): EbayPriceData | null => {
    if (items.length === 0) {
        return null;
    }

    const prices = items.map(i => i.soldPrice).sort((a, b) => a - b);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    // Calculate basic stats
    const sum = prices.reduce((a, b) => a + b, 0);
    const averagePrice = Math.round(sum / prices.length);
    const medianPrice = prices.length % 2 === 0
        ? Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
        : prices[Math.floor(prices.length / 2)];

    // Calculate trend (compare recent vs older sales)
    const recentItems = items.filter(i => i.soldDate >= fifteenDaysAgo);
    const olderItems = items.filter(i => i.soldDate < fifteenDaysAgo && i.soldDate >= thirtyDaysAgo);

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (recentItems.length >= 3 && olderItems.length >= 3) {
        const recentAvg = recentItems.reduce((a, b) => a + b.soldPrice, 0) / recentItems.length;
        const olderAvg = olderItems.reduce((a, b) => a + b.soldPrice, 0) / olderItems.length;
        const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (percentChange > 5) trend = 'up';
        else if (percentChange < -5) trend = 'down';
    }

    // Calculate volatility (coefficient of variation)
    const variance = prices.reduce((acc, p) => acc + Math.pow(p - averagePrice, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / averagePrice) * 100; // Coefficient of variation as percentage

    let volatility: 'low' | 'medium' | 'high' = 'low';
    if (cv > 30) volatility = 'high';
    else if (cv > 15) volatility = 'medium';

    return {
        averagePrice,
        medianPrice,
        priceRange: { min: prices[0], max: prices[prices.length - 1] },
        sampleSize: items.length,
        trend,
        volatility,
        lastUpdated: now,
    };
};

/**
 * Get complete pricing data for an item
 * Searches eBay and calculates stats in one call
 */
export const getEbayPricing = async (
    searchQuery: string,
    options: { categoryId?: string; condition?: string } = {}
): Promise<EbayPriceData | null> => {
    const items = await searchSoldItems(searchQuery, options);

    if (items.length === 0) {
        return null;
    }

    return calculatePriceStats(items);
};

// =============================================================================
// USER OAUTH - Authorization Code Grant (for inventory import)
// =============================================================================

/**
 * Get inventory API URLs based on environment
 */
const getInventoryUrls = () => {
    const isSandbox = ENVIRONMENT === 'SANDBOX';
    return {
        auth: isSandbox ? EBAY_SANDBOX_AUTH_URL : EBAY_AUTH_URL,
        oauth: isSandbox ? EBAY_SANDBOX_OAUTH_URL : EBAY_OAUTH_URL,
        inventory: isSandbox ? EBAY_SANDBOX_INVENTORY_API : EBAY_INVENTORY_API,
    };
};

/**
 * Generate the eBay authorization URL for user consent
 * User will be redirected here to grant access to their inventory
 */
export const getEbayAuthUrl = (state: string): string => {
    const urls = getInventoryUrls();

    const params = new URLSearchParams({
        client_id: APP_ID,
        redirect_uri: RU_NAME || REDIRECT_URI,
        response_type: 'code',
        scope: USER_SCOPES,
        state: state,  // Include user ID or session token for security
    });

    return `${urls.auth}?${params.toString()}`;
};

/**
 * Exchange authorization code for user access + refresh tokens
 */
export const exchangeCodeForToken = async (code: string): Promise<EbayUserToken | null> => {
    const urls = getInventoryUrls();
    const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString('base64');

    try {
        const response = await fetch(urls.oauth, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: RU_NAME || REDIRECT_URI,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('eBay token exchange error:', response.status, errorText);
            return null;
        }

        const data = await response.json();

        return {
            userId: 0, // Will be set when storing
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + (data.expires_in * 1000)),
            ebayUserId: data.user_id,
        };
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        return null;
    }
};

/**
 * Refresh an expired user token
 */
export const refreshUserToken = async (refreshToken: string): Promise<EbayUserToken | null> => {
    const urls = getInventoryUrls();
    const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString('base64');

    try {
        const response = await fetch(urls.oauth, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`,
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                scope: USER_SCOPES,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('eBay token refresh error:', response.status, errorText);
            return null;
        }

        const data = await response.json();

        return {
            userId: 0,
            accessToken: data.access_token,
            refreshToken: data.refresh_token || refreshToken, // eBay may not return new refresh token
            expiresAt: new Date(Date.now() + (data.expires_in * 1000)),
        };
    } catch (error) {
        console.error('Error refreshing token:', error);
        return null;
    }
};

/**
 * Store user's eBay OAuth tokens in database
 */
export const storeUserToken = (userId: number, token: EbayUserToken): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO ebay_user_tokens (user_id, access_token, refresh_token, token_expires_at, ebay_user_id, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET
               access_token = excluded.access_token,
               refresh_token = excluded.refresh_token,
               token_expires_at = excluded.token_expires_at,
               ebay_user_id = excluded.ebay_user_id,
               updated_at = datetime('now')`,
            [userId, token.accessToken, token.refreshToken, token.expiresAt.toISOString(), token.ebayUserId || null],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

/**
 * Get user's stored eBay token, refreshing if expired
 */
export const getUserToken = async (userId: number): Promise<EbayUserToken | null> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT user_id, access_token, refresh_token, token_expires_at, ebay_user_id
             FROM ebay_user_tokens WHERE user_id = ?`,
            [userId],
            async (err, row: any) => {
                if (err) return reject(err);
                if (!row) return resolve(null);

                const token: EbayUserToken = {
                    userId: row.user_id,
                    accessToken: row.access_token,
                    refreshToken: row.refresh_token,
                    expiresAt: new Date(row.token_expires_at),
                    ebayUserId: row.ebay_user_id,
                };

                // Check if token is expired (with 5 min buffer)
                if (token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
                    console.log('User eBay token expired, refreshing...');
                    const newToken = await refreshUserToken(token.refreshToken);
                    if (newToken) {
                        newToken.userId = userId;
                        await storeUserToken(userId, newToken);
                        return resolve(newToken);
                    } else {
                        // Refresh failed, user needs to re-authorize
                        return resolve(null);
                    }
                }

                resolve(token);
            }
        );
    });
};

/**
 * Check if user has a valid eBay connection
 */
export const hasEbayConnection = async (userId: number): Promise<boolean> => {
    const token = await getUserToken(userId);
    return token !== null;
};

/**
 * Disconnect user's eBay account
 */
export const disconnectEbay = (userId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM ebay_user_tokens WHERE user_id = ?', [userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// =============================================================================
// INVENTORY IMPORT FUNCTIONS
// =============================================================================

/**
 * Fetch user's active eBay listings
 */
export const fetchUserListings = async (userId: number): Promise<EbayListing[]> => {
    const token = await getUserToken(userId);
    if (!token) {
        console.log('No valid eBay token for user', userId);
        return [];
    }

    const urls = getInventoryUrls();
    const listings: EbayListing[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
        try {
            // Use the Inventory API to get inventory items
            const response = await fetch(
                `${urls.inventory}/inventory_item?limit=${limit}&offset=${offset}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token.accessToken}`,
                        'Content-Type': 'application/json',
                        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
                    },
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('eBay inventory fetch error:', response.status, errorText);
                break;
            }

            const data = await response.json();

            if (data.inventoryItems && data.inventoryItems.length > 0) {
                for (const item of data.inventoryItems) {
                    listings.push({
                        itemId: item.sku, // SKU is the unique identifier in Inventory API
                        sku: item.sku,
                        title: item.product?.title || 'Untitled',
                        description: item.product?.description || '',
                        condition: mapEbayCondition(item.condition),
                        conditionDescription: item.conditionDescription,
                        price: 0, // Will need to fetch from offer
                        quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
                        imageUrls: item.product?.imageUrls || [],
                        categoryId: '', // Will need to fetch from offer
                        categoryName: '',
                        listingStatus: 'ACTIVE',
                    });
                }

                offset += data.inventoryItems.length;
                hasMore = data.inventoryItems.length === limit;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error('Error fetching eBay inventory:', error);
            break;
        }
    }

    // Now fetch offers to get pricing information
    if (listings.length > 0) {
        await enrichListingsWithOffers(listings, token.accessToken, urls.inventory);
    }

    return listings;
};

/**
 * Enrich listings with price and category from offers
 */
const enrichListingsWithOffers = async (
    listings: EbayListing[],
    accessToken: string,
    inventoryUrl: string
): Promise<void> => {
    try {
        const response = await fetch(
            `${inventoryUrl}/offer?limit=200`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
                },
            }
        );

        if (!response.ok) return;

        const data = await response.json();

        if (data.offers) {
            const offerMap = new Map<string, any>();
            for (const offer of data.offers) {
                offerMap.set(offer.sku, offer);
            }

            for (const listing of listings) {
                const offer = offerMap.get(listing.sku);
                if (offer) {
                    listing.price = Math.round(parseFloat(offer.pricingSummary?.price?.value || '0') * 100);
                    listing.categoryId = offer.categoryId || '';
                    listing.listingStatus = offer.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
                }
            }
        }
    } catch (error) {
        console.error('Error fetching offers:', error);
    }
};

/**
 * Map eBay condition enum to our condition format
 */
const mapEbayCondition = (ebayCondition?: string): string => {
    const conditionMap: Record<string, string> = {
        'NEW': 'NEW_SEALED',
        'NEW_WITH_TAGS': 'NEW_SEALED',
        'NEW_WITHOUT_TAGS': 'NEW_SEALED',
        'NEW_WITH_DEFECTS': 'GOOD',
        'LIKE_NEW': 'CIB',
        'USED_EXCELLENT': 'CIB',
        'USED_VERY_GOOD': 'GOOD',
        'USED_GOOD': 'GOOD',
        'USED_ACCEPTABLE': 'LOOSE',
        'FOR_PARTS_OR_NOT_WORKING': 'LOOSE',
    };
    return conditionMap[ebayCondition || ''] || 'GOOD';
};

/**
 * Check if an eBay item has already been imported
 */
export const isItemImported = (userId: number, ebayItemId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT 1 FROM ebay_imported_items WHERE user_id = ? AND ebay_item_id = ?',
            [userId, ebayItemId],
            (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            }
        );
    });
};

/**
 * Mark an eBay item as imported
 */
export const markItemImported = (userId: number, ebayItemId: string, leverageItemId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT OR IGNORE INTO ebay_imported_items (user_id, ebay_item_id, leverage_item_id) VALUES (?, ?, ?)',
            [userId, ebayItemId, leverageItemId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};
