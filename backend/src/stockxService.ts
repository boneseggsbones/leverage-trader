/**
 * StockX API Service (via RapidAPI)
 * 
 * Real-time sneaker and streetwear pricing with size-specific data.
 * Uses the "StockX Market Data" API on RapidAPI.
 * 
 * API: https://rapidapi.com/api-developer123/api/stockx-market-data
 */

const STOCKX_RAPIDAPI_KEY = process.env.STOCKX_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY || '';
const STOCKX_HOST = 'stockx-market-data.p.rapidapi.com';
const STOCKX_BASE_URL = `https://${STOCKX_HOST}`;

// API Response types
interface StockxProduct {
    id: string;
    uuid: string;
    title: string;
    brand: string;
    colorway?: string;
    category: string;
    gender?: string;
    imageSrc?: string;
    retailPrice?: number;
    releaseDate?: string;
    styleId?: string;
}

interface StockxMarketData {
    highestBid: number;
    lowestAsk: number;
    lastSale: number;
    lastSaleSize?: string;
    salesLast72Hours?: number;
    changeValue?: number;
    changePercentage?: number;
}

interface StockxSearchResponse {
    products: Array<{
        product: StockxProduct;
        market?: StockxMarketData;
    }>;
}

interface StockxPriceResponse {
    product: StockxProduct;
    market: StockxMarketData;
    sizes?: Array<{
        size: string;
        lowestAsk: number;
        highestBid: number;
        lastSale?: number;
    }>;
}

// Our normalized return type
export interface SneakerPriceData {
    productId: string;
    productName: string;
    brand: string;
    colorway?: string;
    styleId?: string;
    imageUrl?: string;
    lastSale: number;          // in cents
    lowestAsk: number;         // in cents
    highestBid: number;        // in cents
    retailPrice?: number;      // in cents
    size?: string;
    priceRange: {
        low: number;           // highest bid
        high: number;          // lowest ask
    };
    lastUpdated: Date;
}

/**
 * Check if StockX API is configured
 */
export const isStockxConfigured = (): boolean => {
    return STOCKX_RAPIDAPI_KEY.length > 10;
};

/**
 * Search for sneakers/streetwear by name or SKU
 */
export const searchSneakers = async (
    query: string,
    options: {
        limit?: number;
    } = {}
): Promise<SneakerPriceData[]> => {
    if (!isStockxConfigured()) {
        console.log('[StockX] Not configured, skipping');
        return [];
    }

    if (!query || query.trim().length < 2) {
        return [];
    }

    try {
        console.log(`[StockX] Searching for: "${query}"`);

        const response = await fetch(`${STOCKX_BASE_URL}/search?query=${encodeURIComponent(query)}`, {
            headers: {
                'x-rapidapi-host': STOCKX_HOST,
                'x-rapidapi-key': STOCKX_RAPIDAPI_KEY,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[StockX] API error ${response.status}:`, errorText);
            return [];
        }

        const data: StockxSearchResponse = await response.json();

        if (!data.products || data.products.length === 0) {
            console.log(`[StockX] No results for "${query}"`);
            return [];
        }

        const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

        const results: SneakerPriceData[] = data.products
            .slice(0, options.limit || 10)
            .filter(p => p.market && p.market.lastSale > 0)
            .map(({ product, market }) => ({
                productId: product.uuid || product.id,
                productName: product.title,
                brand: product.brand,
                colorway: product.colorway,
                styleId: product.styleId,
                imageUrl: product.imageSrc,
                lastSale: dollarsToCents(market!.lastSale),
                lowestAsk: dollarsToCents(market!.lowestAsk || 0),
                highestBid: dollarsToCents(market!.highestBid || 0),
                retailPrice: product.retailPrice ? dollarsToCents(product.retailPrice) : undefined,
                priceRange: {
                    low: dollarsToCents(market!.highestBid || market!.lastSale * 0.85),
                    high: dollarsToCents(market!.lowestAsk || market!.lastSale * 1.15),
                },
                lastUpdated: new Date(),
            }));

        console.log(`[StockX] Found ${results.length} products`);
        return results;

    } catch (error) {
        console.error('[StockX] Request failed:', error);
        return [];
    }
};

/**
 * Get price for a specific product with optional size
 */
export const getSneakerPrice = async (
    productId: string,
    size?: string
): Promise<SneakerPriceData | null> => {
    if (!isStockxConfigured()) {
        return null;
    }

    try {
        const url = size
            ? `${STOCKX_BASE_URL}/product/${productId}?size=${encodeURIComponent(size)}`
            : `${STOCKX_BASE_URL}/product/${productId}`;

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-host': STOCKX_HOST,
                'x-rapidapi-key': STOCKX_RAPIDAPI_KEY,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data: StockxPriceResponse = await response.json();
        const { product, market, sizes } = data;

        if (!market) {
            return null;
        }

        const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

        // If size specified and we have size data, use that
        let sizeData = null;
        if (size && sizes) {
            sizeData = sizes.find(s => s.size === size);
        }

        return {
            productId: product.uuid || product.id,
            productName: product.title,
            brand: product.brand,
            colorway: product.colorway,
            styleId: product.styleId,
            imageUrl: product.imageSrc,
            lastSale: dollarsToCents(sizeData?.lastSale || market.lastSale),
            lowestAsk: dollarsToCents(sizeData?.lowestAsk || market.lowestAsk || 0),
            highestBid: dollarsToCents(sizeData?.highestBid || market.highestBid || 0),
            retailPrice: product.retailPrice ? dollarsToCents(product.retailPrice) : undefined,
            size,
            priceRange: {
                low: dollarsToCents(sizeData?.highestBid || market.highestBid || market.lastSale * 0.85),
                high: dollarsToCents(sizeData?.lowestAsk || market.lowestAsk || market.lastSale * 1.15),
            },
            lastUpdated: new Date(),
        };

    } catch (error) {
        console.error('[StockX] Product lookup failed:', error);
        return null;
    }
};

/**
 * Detect if an item name is likely a sneaker
 */
export const isSneakerItem = (itemName: string, category?: string): boolean => {
    const sneakerKeywords = [
        'jordan', 'nike', 'adidas', 'yeezy', 'dunk', 'air max',
        'air force', 'new balance', 'nb 550', 'asics', 'puma',
        'retro', 'off-white', 'travis scott', 'supreme',
        'size 7', 'size 8', 'size 9', 'size 10', 'size 11', 'size 12',
        'ds', 'deadstock', 'vnds', 'bred', 'chicago', 'unc',
        'sb dunk', 'aj1', 'aj4', 'aj11'
    ];

    const lowerName = itemName.toLowerCase();
    const lowerCategory = (category || '').toLowerCase();

    return sneakerKeywords.some(keyword =>
        lowerName.includes(keyword) || lowerCategory.includes(keyword)
    ) || lowerCategory.includes('sneaker') || lowerCategory.includes('shoe');
};
