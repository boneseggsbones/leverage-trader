// This file outlines the complete, multi-layered "Hybrid Trust Model" Valuation Engine.
// It includes a provider-based architecture, a router to select the correct provider,
// a consolidator for multiple results, and a caching layer for performance.

// Fix: Add .tsx extension to module imports
import { Item } from '../types.ts';

// --- STAGE 1: Standardized Interfaces and DTOs (The Contracts) ---

// Standardized input DTO for any valuation request
export interface ItemValuationInput {
    title: string;
    category: Item['category'] | string;
    condition: Item['condition'];
    identifiers: {
        upc?: string;
        isbn?: string;
        [key: string]: any;
    };
}

// Standardized output DTO from any valuation provider
export interface ValuationResultDTO {
    apiName: string;
    apiItemId: string | null;
    confidenceScore: number; // 0-100
    pricePoints: Record<string, number | string>; // Flexible data structure
    error?: string;
}

// The core provider interface (The Strategy Pattern)
interface IValuationProvider {
    getProviderName(): string;
    getSpecializedCategories(): string[];
    getValuation(input: ItemValuationInput): Promise<ValuationResultDTO | null>;
}

// Final result from the entire engine
export interface EMVCalculationResult {
    status: 'API_VERIFIED' | 'USER_INPUT_REQUIRED' | 'INCOMPLETE';
    finalEMV: number | null; // in cents
    valuationSource: Item['valuationSource'];
    apiMetadata: Item['apiMetadata'];
}

// --- Caching Layer Implementation ---

const valuationCacheConfig = {
    ttl: { // Time-to-Live in milliseconds
        PriceChartingProvider: 24 * 60 * 60 * 1000, // 24 hours
        JustTCGProvider: 24 * 60 * 60 * 1000,
        KicksDBProvider: 24 * 60 * 60 * 1000,
    }
};

class CacheService {
    private cache = new Map<string, { data: any, timestamp: number }>();

    get<T>(key: string, ttl: number): T | null {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        const isExpired = (Date.now() - entry.timestamp) > ttl;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set(key: string, data: any) {
        this.cache.set(key, { data, timestamp: Date.now() });
    }
}
const valuationCache = new CacheService();


// --- STAGE 2: Provider Implementations (The Concrete Strategies) ---

// Mock database simulating PriceCharting's API data
const priceChartingDb = new Map<string, any>([
    ['super mario 64', { id: 'pc-123', 'cib-price': 7500, 'loose-price': 3000, 'new-price': 25000 }],
    ['ocarina of time', { id: 'pc-456', 'cib-price': 12000, 'loose-price': 5000, 'new-price': 35000 }],
    ['playstation 5', { id: 'pc-789', 'new-price': 45000 }],
]);

class PriceChartingProvider implements IValuationProvider {
    getProviderName = () => 'PriceChartingProvider';
    getSpecializedCategories = () => ['VIDEO_GAMES'];

    async getValuation(input: ItemValuationInput): Promise<ValuationResultDTO | null> {
        const cacheKey = `valuation:${this.getProviderName()}:${input.title.toLowerCase()}`;
        const cached = valuationCache.get<ValuationResultDTO>(cacheKey, valuationCacheConfig.ttl.PriceChartingProvider);
        if (cached) {
            return cached;
        }
        
        await new Promise(res => setTimeout(res, 250)); // Simulate API latency
        const dbKey = input.title.toLowerCase();
        const data = priceChartingDb.get(dbKey);

        if (!data) {
            return { apiName: this.getProviderName(), apiItemId: null, confidenceScore: 0, pricePoints: {} };
        }

        const result: ValuationResultDTO = {
            apiName: this.getProviderName(),
            apiItemId: data.id,
            confidenceScore: 95, // High confidence for a direct match
            pricePoints: data
        };
        
        valuationCache.set(cacheKey, result);
        return result;
    }
}

class JustTCGProvider implements IValuationProvider {
    getProviderName = () => 'JustTCGProvider';
    getSpecializedCategories = () => ['TCG'];

    async getValuation(input: ItemValuationInput): Promise<ValuationResultDTO | null> {
        const cacheKey = `valuation:${this.getProviderName()}:${input.title.toLowerCase()}:${input.condition}`;
        const cached = valuationCache.get<ValuationResultDTO>(cacheKey, valuationCacheConfig.ttl.JustTCGProvider);
        if (cached) {
            return cached;
        }

        await new Promise(res => setTimeout(res, 200)); // Simulate API latency
        if (input.title.toLowerCase().includes('charizard')) {
             const result: ValuationResultDTO = {
                apiName: this.getProviderName(),
                apiItemId: 'tcg-char-1',
                confidenceScore: 90,
                pricePoints: { 'near-mint-price': 50000, 'lightly-played-price': 35000 },
            };
            valuationCache.set(cacheKey, result);
            return result;
        }
        return null;
    }
}

class KicksDBProvider implements IValuationProvider {
    getProviderName = () => 'KicksDBProvider';
    getSpecializedCategories = () => ['SNEAKERS'];
    async getValuation(input: ItemValuationInput): Promise<ValuationResultDTO | null> {
        // Mock implementation
        return null;
    }
}

// --- STAGE 3: The ValuationRouterService (The Context) ---

const valuationConfig = {
    defaultProvider: "PriceChartingProvider",
    earlyExitConfidenceThreshold: 90,
    categoryRouting: {
        TCG: ["JustTCGProvider", "PriceChartingProvider"],
        SNEAKERS: ["KicksDBProvider", "PriceChartingProvider"],
        VIDEO_GAMES: ["PriceChartingProvider"]
    },
};

class ValuationRouterService {
    private providers: Map<string, IValuationProvider>;

    constructor() {
        this.providers = new Map();
        // Register all available providers
        [new PriceChartingProvider(), new JustTCGProvider(), new KicksDBProvider()].forEach(p => {
            this.providers.set(p.getProviderName(), p);
        });
    }

    async routeValuationRequest(input: ItemValuationInput): Promise<ValuationResultDTO[]> {
        const providerNames = valuationConfig.categoryRouting[input.category as keyof typeof valuationConfig.categoryRouting] 
                           || [valuationConfig.defaultProvider];

        const results: ValuationResultDTO[] = [];
        for (const name of providerNames) {
            const provider = this.providers.get(name);
            if (provider) {
                const result = await provider.getValuation(input);
                if (result) {
                    results.push(result);
                    if (result.confidenceScore >= valuationConfig.earlyExitConfidenceThreshold) {
                        break; // Early exit on high confidence
                    }
                }
            }
        }
        return results;
    }
}

// --- STAGE 4: The ValuationConsolidatorService (The Referee) ---

class ValuationConsolidatorService {
    consolidate(results: ValuationResultDTO[]): ValuationResultDTO {
        if (results.length === 1) {
            return results[0];
        }

        let totalWeightedValue = 0;
        let totalConfidence = 0;
        const allPricePoints: Record<string, any> = {};

        results.forEach(res => {
            const baseline = res.pricePoints['cib-price'] || res.pricePoints['loose-price'] || Object.values(res.pricePoints).find(v => typeof v === 'number');
            if (typeof baseline === 'number') {
                totalWeightedValue += baseline * res.confidenceScore;
                totalConfidence += res.confidenceScore;
                allPricePoints[res.apiName] = res.pricePoints;
            }
        });

        const consolidatedBEMV = totalConfidence > 0 ? totalWeightedValue / totalConfidence : 0;
        const finalConfidence = totalConfidence / results.length; // Simple average for now

        return {
            apiName: 'Consolidated',
            apiItemId: results.map(r => r.apiItemId).join(','),
            confidenceScore: finalConfidence,
            pricePoints: {
                consolidatedBaseline: consolidatedBEMV,
                // Fix: Stringify the sources object to match the DTO's pricePoints value type.
                sources: JSON.stringify(allPricePoints),
            }
        };
    }
}


// --- STAGE 5: The EMVCalculatorService (The Final Calculation) ---

class EMVCalculatorService {
    calculateFinalEMV(userCondition: Item['condition'], valuationResult: ValuationResultDTO): EMVCalculationResult {
        let finalEMV: number | null = null;
        let apiConditionUsed: string | null = null;
        const { pricePoints, confidenceScore, apiName, apiItemId } = valuationResult;

        // Fix: Add logic to handle consolidated results by checking for 'consolidatedBaseline'.
        if (pricePoints && typeof pricePoints['consolidatedBaseline'] === 'number') {
            finalEMV = pricePoints['consolidatedBaseline'] as number;
            apiConditionUsed = 'consolidatedBaseline';
        } else {
            const conditionMap: Record<Item['condition'], string[]> = {
                'NEW_SEALED': ['new-price'],
                'CIB': ['cib-price'],
                'GRADED': ['cib-price'], // Assuming graded implies at least CIB
                'LOOSE': ['loose-price'],
                'OTHER': ['loose-price'],
            };
    
            const priceKey = conditionMap[userCondition]?.[0];
            if (priceKey && pricePoints && typeof pricePoints[priceKey] === 'number') {
                finalEMV = pricePoints[priceKey] as number;
                apiConditionUsed = priceKey;
            }
        }


        if (finalEMV === null || (confidenceScore ?? 0) < 60) {
            return { status: 'USER_INPUT_REQUIRED', finalEMV: null, valuationSource: 'USER_DEFINED_UNIQUE', apiMetadata: { ...this.createEmptyApiMetadata(), confidenceScore: confidenceScore ?? null } };
        }

        return {
            status: 'API_VERIFIED',
            finalEMV,
            valuationSource: 'API_VERIFIED',
            apiMetadata: {
                apiName: apiName as Item['apiMetadata']['apiName'],
                apiItemId,
                baselineApiValue: finalEMV,
                apiConditionUsed,
                confidenceScore: confidenceScore ?? null,
                lastApiSyncTimestamp: new Date(),
                rawDataSnapshot: pricePoints,
            }
        };
    }
    
    private createEmptyApiMetadata = (): Item['apiMetadata'] => ({
        apiName: null, apiItemId: null, baselineApiValue: null, apiConditionUsed: null,
        confidenceScore: null, lastApiSyncTimestamp: null, rawDataSnapshot: null
    });
}


// --- Exported Singleton Instances ---
export const valuationRouterService = new ValuationRouterService();
export const valuationConsolidatorService = new ValuationConsolidatorService();
export const emvCalculatorService = new EMVCalculatorService();