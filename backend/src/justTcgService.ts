/**
 * JustTCG API Service
 * 
 * Real-time pricing for Trading Card Games (Pokémon, MTG, Yu-Gi-Oh!)
 * with condition-specific data (Near Mint, Lightly Played, etc.)
 * 
 * API: https://justtcg.com
 * Docs: https://docs.justtcg.com
 */

const JUSTTCG_API_KEY = process.env.JUSTTCG_API_KEY || '';
const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

// Supported games
export type TcgGame = 'pokemon' | 'mtg' | 'yugioh' | 'lorcana' | 'onepiece';

// Card conditions
export type TcgCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';

// API Response types
interface JustTcgCard {
    id: string;
    name: string;
    set: string;
    setName: string;
    number: string;
    rarity?: string;
    imageUrl?: string;
    tcgplayerId?: string;
    prices: {
        normal?: {
            market: number;
            low: number;
            mid: number;
            high: number;
        };
        foil?: {
            market: number;
            low: number;
            mid: number;
            high: number;
        };
    };
}

interface JustTcgSearchResponse {
    cards: JustTcgCard[];
    totalResults: number;
    page: number;
    pageSize: number;
}

// Our normalized return type
export interface TcgPriceData {
    cardId: string;
    cardName: string;
    setName: string;
    marketPrice: number;      // in cents
    lowPrice: number;         // in cents
    highPrice: number;        // in cents
    isFoil: boolean;
    condition: TcgCondition;
    imageUrl?: string;
    lastUpdated: Date;
}

/**
 * Check if JustTCG API is configured
 */
export const isJustTcgConfigured = (): boolean => {
    return JUSTTCG_API_KEY.length > 10;
};

/**
 * Map condition to price multiplier
 * Near Mint = 100%, each lower grade reduces value
 */
const conditionMultiplier: Record<TcgCondition, number> = {
    'NM': 1.0,
    'LP': 0.85,
    'MP': 0.70,
    'HP': 0.50,
    'DMG': 0.30
};

/**
 * Search for trading cards by name
 */
export const searchTcgCards = async (
    query: string,
    options: {
        game?: TcgGame;
        limit?: number;
    } = {}
): Promise<TcgPriceData[]> => {
    if (!isJustTcgConfigured()) {
        console.log('[JustTCG] Not configured, skipping');
        return [];
    }

    if (!query || query.trim().length < 2) {
        return [];
    }

    try {
        const params = new URLSearchParams({
            q: query.trim(),
            limit: String(options.limit || 10),
        });

        if (options.game) {
            params.append('game', options.game);
        }

        console.log(`[JustTCG] Searching for: "${query}"`);

        const response = await fetch(`${JUSTTCG_BASE_URL}/cards/search?${params}`, {
            headers: {
                'Authorization': `Bearer ${JUSTTCG_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[JustTCG] API error ${response.status}:`, errorText);
            return [];
        }

        const data: JustTcgSearchResponse = await response.json();

        if (!data.cards || data.cards.length === 0) {
            console.log(`[JustTCG] No results for "${query}"`);
            return [];
        }

        // Convert to our format (cents)
        const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

        const results: TcgPriceData[] = data.cards.map(card => {
            const prices = card.prices.foil || card.prices.normal;
            const isFoil = !!card.prices.foil && !card.prices.normal;

            return {
                cardId: card.id,
                cardName: card.name,
                setName: card.setName || card.set,
                marketPrice: dollarsToCents(prices?.market || 0),
                lowPrice: dollarsToCents(prices?.low || 0),
                highPrice: dollarsToCents(prices?.high || 0),
                isFoil,
                condition: 'NM' as TcgCondition,
                imageUrl: card.imageUrl,
                lastUpdated: new Date(),
            };
        }).filter(card => card.marketPrice > 0);

        console.log(`[JustTCG] Found ${results.length} cards`);
        return results;

    } catch (error) {
        console.error('[JustTCG] Request failed:', error);
        return [];
    }
};

/**
 * Get price for a specific card with condition adjustment
 */
export const getTcgCardPrice = async (
    cardId: string,
    condition: TcgCondition = 'NM',
    isFoil: boolean = false
): Promise<TcgPriceData | null> => {
    if (!isJustTcgConfigured()) {
        return null;
    }

    try {
        const response = await fetch(`${JUSTTCG_BASE_URL}/cards/${cardId}`, {
            headers: {
                'Authorization': `Bearer ${JUSTTCG_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            return null;
        }

        const card: JustTcgCard = await response.json();
        const prices = isFoil ? card.prices.foil : card.prices.normal;

        if (!prices) {
            return null;
        }

        const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);
        const multiplier = conditionMultiplier[condition];

        return {
            cardId: card.id,
            cardName: card.name,
            setName: card.setName || card.set,
            marketPrice: Math.round(dollarsToCents(prices.market) * multiplier),
            lowPrice: Math.round(dollarsToCents(prices.low) * multiplier),
            highPrice: Math.round(dollarsToCents(prices.high) * multiplier),
            isFoil,
            condition,
            imageUrl: card.imageUrl,
            lastUpdated: new Date(),
        };

    } catch (error) {
        console.error('[JustTCG] Card lookup failed:', error);
        return null;
    }
};

/**
 * Detect if an item name is likely a trading card
 */
export const isTcgItem = (itemName: string, category?: string): boolean => {
    const tcgKeywords = [
        'pokemon', 'pokémon', 'psa', 'cgc', 'bgs',
        'magic', 'mtg', 'yugioh', 'yu-gi-oh',
        'lorcana', 'one piece', 'holo', 'holographic',
        'charizard', 'pikachu', 'base set', 'shadowless',
        'foil', 'rare', 'ultra rare', 'full art',
        'booster', 'pack', 'box', 'etb'
    ];

    const lowerName = itemName.toLowerCase();
    const lowerCategory = (category || '').toLowerCase();

    return tcgKeywords.some(keyword =>
        lowerName.includes(keyword) || lowerCategory.includes(keyword)
    ) || lowerCategory.includes('tcg') || lowerCategory.includes('card');
};
