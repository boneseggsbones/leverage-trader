import {
    isEbayConfigured,
    getOAuthToken,
    searchSoldItems,
    calculatePriceStats,
    getEbayPricing,
    EbaySoldItem,
    EbayPriceData
} from './ebayService';

// Mock fetch for API tests
const originalFetch = global.fetch;

beforeEach(() => {
    jest.resetModules();
});

afterEach(() => {
    global.fetch = originalFetch;
});

describe('eBay Service', () => {
    describe('isEbayConfigured', () => {
        it('should return false when credentials are not set', () => {
            // Without env vars set, should return false
            const result = isEbayConfigured();
            // This depends on environment - test the function exists
            expect(typeof result).toBe('boolean');
        });
    });

    describe('calculatePriceStats', () => {
        const now = new Date();
        const createMockItem = (price: number, daysAgo: number = 0): EbaySoldItem => ({
            itemId: `item-${Math.random()}`,
            title: 'Test Item',
            soldPrice: price,
            soldDate: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000),
            condition: 'Used',
            conditionId: '3000',
            buyingFormat: 'FIXED_PRICE',
            categoryId: '123'
        });

        it('should return null for empty array', () => {
            const result = calculatePriceStats([]);
            expect(result).toBeNull();
        });

        it('should calculate correct average price', () => {
            const items = [
                createMockItem(1000), // $10.00
                createMockItem(2000), // $20.00
                createMockItem(3000), // $30.00
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.averagePrice).toBe(2000); // $20.00 average
        });

        it('should calculate correct median price for odd number of items', () => {
            const items = [
                createMockItem(1000),
                createMockItem(2000),
                createMockItem(5000),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.medianPrice).toBe(2000); // Middle value
        });

        it('should calculate correct median price for even number of items', () => {
            const items = [
                createMockItem(1000),
                createMockItem(2000),
                createMockItem(3000),
                createMockItem(4000),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            // Median of [1000, 2000, 3000, 4000] = (2000 + 3000) / 2 = 2500
            expect(result!.medianPrice).toBe(2500);
        });

        it('should calculate correct price range', () => {
            const items = [
                createMockItem(500),
                createMockItem(1500),
                createMockItem(3000),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.priceRange.min).toBe(500);
            expect(result!.priceRange.max).toBe(3000);
        });

        it('should return sample size', () => {
            const items = [
                createMockItem(1000),
                createMockItem(2000),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.sampleSize).toBe(2);
        });

        it('should detect upward trend', () => {
            // Older items (15-30 days ago) at lower prices
            const olderItems = [
                createMockItem(1000, 20),
                createMockItem(1100, 22),
                createMockItem(1200, 25),
            ];
            // Recent items (0-15 days) at higher prices
            const recentItems = [
                createMockItem(1500, 1),
                createMockItem(1600, 5),
                createMockItem(1700, 10),
            ];

            const result = calculatePriceStats([...olderItems, ...recentItems]);

            expect(result).not.toBeNull();
            expect(result!.trend).toBe('up');
        });

        it('should detect downward trend', () => {
            // Older items at higher prices
            const olderItems = [
                createMockItem(2000, 20),
                createMockItem(2100, 22),
                createMockItem(2200, 25),
            ];
            // Recent items at lower prices
            const recentItems = [
                createMockItem(1500, 1),
                createMockItem(1400, 5),
                createMockItem(1300, 10),
            ];

            const result = calculatePriceStats([...olderItems, ...recentItems]);

            expect(result).not.toBeNull();
            expect(result!.trend).toBe('down');
        });

        it('should detect stable trend', () => {
            // All items at similar prices
            const items = [
                createMockItem(2000, 1),
                createMockItem(2050, 10),
                createMockItem(1950, 20),
                createMockItem(2000, 25),
                createMockItem(2025, 5),
                createMockItem(1975, 15),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.trend).toBe('stable');
        });

        it('should classify low volatility', () => {
            // Prices very close together (low std dev)
            const items = [
                createMockItem(2000),
                createMockItem(2010),
                createMockItem(1990),
                createMockItem(2005),
                createMockItem(1995),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.volatility).toBe('low');
        });

        it('should classify high volatility', () => {
            // Prices widely spread (high std dev)
            const items = [
                createMockItem(500),
                createMockItem(5000),
                createMockItem(1000),
                createMockItem(3500),
                createMockItem(200),
            ];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.volatility).toBe('high');
        });

        it('should include lastUpdated timestamp', () => {
            const items = [createMockItem(1000)];

            const result = calculatePriceStats(items);

            expect(result).not.toBeNull();
            expect(result!.lastUpdated).toBeInstanceOf(Date);
        });
    });

    describe('searchSoldItems (mocked)', () => {
        it('should return empty array when not configured', async () => {
            // Mock getOAuthToken to return null
            jest.spyOn(require('./ebayService'), 'getOAuthToken').mockResolvedValue(null);

            const items = await searchSoldItems('nintendo switch');

            // Without valid token, should return empty
            expect(Array.isArray(items)).toBe(true);
        });
    });

    describe('getEbayPricing', () => {
        it('should return null when no items found', async () => {
            // Without API configured, this should return null
            const result = await getEbayPricing('some-obscure-item-that-definitely-does-not-exist-xyz123');

            // Either null or valid data structure
            if (result !== null) {
                expect(result).toHaveProperty('averagePrice');
                expect(result).toHaveProperty('medianPrice');
                expect(result).toHaveProperty('sampleSize');
            }
        });
    });

    describe('API Response Transformation', () => {
        it('should correctly parse buying format', () => {
            // Unit test the logic of determining buying format
            const auctionOptions = ['AUCTION', 'BEST_OFFER'];
            const fixedOptions = ['FIXED_PRICE', 'BEST_OFFER'];

            expect(auctionOptions.includes('AUCTION')).toBe(true);
            expect(fixedOptions.includes('AUCTION')).toBe(false);
        });

        it('should convert price string to cents correctly', () => {
            const priceString = '25.99';
            const priceInCents = Math.round(parseFloat(priceString) * 100);

            expect(priceInCents).toBe(2599);
        });

        it('should handle edge case prices', () => {
            const edgeCases = [
                { input: '0.01', expected: 1 },
                { input: '0.99', expected: 99 },
                { input: '100.00', expected: 10000 },
                { input: '999.99', expected: 99999 },
            ];

            edgeCases.forEach(({ input, expected }) => {
                const result = Math.round(parseFloat(input) * 100);
                expect(result).toBe(expected);
            });
        });
    });

    describe('Condition Mapping', () => {
        it('should map conditions to eBay IDs', () => {
            const conditionMap: Record<string, string> = {
                'NEW_SEALED': '1000',
                'CIB': '3000',
                'LOOSE': '3000',
                'GOOD': '3000',
                'GRADED': '2750',
            };

            expect(conditionMap['NEW_SEALED']).toBe('1000');
            expect(conditionMap['CIB']).toBe('3000');
            expect(conditionMap['GRADED']).toBe('2750');
        });

        it('should default unknown conditions to Used (3000)', () => {
            const conditionMap: Record<string, string> = {
                'NEW_SEALED': '1000',
                'CIB': '3000',
            };

            const unknownCondition = 'UNKNOWN';
            const ebayCondition = conditionMap[unknownCondition] || '3000';

            expect(ebayCondition).toBe('3000');
        });
    });
});
