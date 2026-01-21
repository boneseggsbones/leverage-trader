/**
 * eBay Marketplace Insights API Service
 * 
 * Provides access to eBay's sold item data for multi-source pricing.
 * Uses OAuth 2.0 Client Credentials flow for authentication.
 */

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
const EBAY_SANDBOX_OAUTH_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_API_BASE = 'https://api.sandbox.ebay.com/buy/marketplace_insights/v1_beta';

const APP_ID = process.env.EBAY_APP_ID || '';
const CERT_ID = process.env.EBAY_CERT_ID || '';
const ENVIRONMENT = process.env.EBAY_ENVIRONMENT || 'SANDBOX';

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
