/**
 * RapidAPI eBay Average Selling Price Service
 * 
 * Uses the "eBay Average Selling Price" API from RapidAPI to get
 * completed/sold listing data when PriceCharting doesn't cover an item.
 * 
 * API: https://rapidapi.com/rubensmau/api/ebay-average-selling-price
 */

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'ebay-average-selling-price.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/findCompletedItems`;

// Response type from RapidAPI (actual structure from testing)
interface RapidApiEbayResponse {
    products?: Array<{
        title: string;
        sale_price: number;
        condition: string;
        buying_format: string;
        date_sold: string;
        image_url?: string;
        link: string;
        item_id: string;
    }>;
}

// Our normalized return type
export interface RapidApiEbaySoldPrice {
    averagePrice: number;      // in cents
    minPrice: number;          // in cents
    maxPrice: number;          // in cents
    sampleSize: number;
    lastUpdated: Date;
    products?: Array<{
        title: string;
        soldPrice: number;     // in cents
        condition: string;
        soldDate: Date;
    }>;
}

/**
 * Check if RapidAPI is configured
 */
export const isRapidApiConfigured = (): boolean => {
    return RAPIDAPI_KEY.length > 10;
};

/**
 * Get eBay sold/completed listing prices via RapidAPI
 * 
 * @param query - Search keywords (item name)
 * @param options - Optional filters
 * @returns Sold price data or null if no results
 */
export const getEbaySoldPrice = async (
    query: string,
    options: {
        excludeKeywords?: string;
        maxResults?: 25 | 50 | 100 | 200;
        categoryId?: string;
    } = {}
): Promise<RapidApiEbaySoldPrice | null> => {
    if (!isRapidApiConfigured()) {
        console.log('[RapidAPI eBay] Not configured, skipping');
        return null;
    }

    if (!query || query.trim().length < 3) {
        console.log('[RapidAPI eBay] Query too short, skipping');
        return null;
    }

    try {
        const requestBody = {
            keywords: query.trim(),
            max_search_results: options.maxResults || 25,
            ...(options.excludeKeywords && { excluded_keywords: options.excludeKeywords }),
            ...(options.categoryId && { category_id: options.categoryId }),
        };

        console.log(`[RapidAPI eBay] Searching for: "${query}"`);

        const response = await fetch(RAPIDAPI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-rapidapi-host': RAPIDAPI_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[RapidAPI eBay] API error ${response.status}:`, errorText);
            return null;
        }

        const data: RapidApiEbayResponse = await response.json();

        // Check if we have products in the response
        if (!data.products || data.products.length === 0) {
            console.log(`[RapidAPI eBay] No results for "${query}"`);
            return null;
        }

        // Convert dollars to cents
        const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

        // Calculate statistics from products array
        const prices = data.products.map(p => p.sale_price).filter(p => p > 0);

        if (prices.length === 0) {
            console.log(`[RapidAPI eBay] No valid prices for "${query}"`);
            return null;
        }

        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const result: RapidApiEbaySoldPrice = {
            averagePrice: dollarsToCents(avgPrice),
            minPrice: dollarsToCents(minPrice),
            maxPrice: dollarsToCents(maxPrice),
            sampleSize: prices.length,
            lastUpdated: new Date(),
        };

        // Include individual products
        result.products = data.products.slice(0, 10).map(p => ({
            title: p.title,
            soldPrice: dollarsToCents(p.sale_price),
            condition: p.condition,
            soldDate: new Date(p.date_sold),
        }));

        console.log(`[RapidAPI eBay] Found ${prices.length} results, avg: $${avgPrice.toFixed(2)}`);
        return result;

    } catch (error) {
        console.error('[RapidAPI eBay] Request failed:', error);
        return null;
    }
};

/**
 * Create an optimized search query for eBay
 * Strips unnecessary words and focuses on identifiable product terms
 */
export const optimizeQueryForEbay = (itemName: string, category?: string): string => {
    // Remove common filler words
    const stopWords = ['the', 'a', 'an', 'for', 'with', 'and', 'or', 'in', 'on', 'at'];

    let query = itemName
        .toLowerCase()
        .split(' ')
        .filter(word => !stopWords.includes(word) && word.length > 1)
        .join(' ');

    // Limit query length to avoid overly specific searches
    const words = query.split(' ');
    if (words.length > 6) {
        query = words.slice(0, 6).join(' ');
    }

    return query;
};
