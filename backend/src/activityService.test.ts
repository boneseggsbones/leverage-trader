import { db, init } from './database';
import {
    logItemView,
    logSearch,
    logTradeAbandoned,
    logProfileView,
    getRecentViews,
    getRecentSearches,
    getActivityStats,
    ActivityEventType
} from './activityService';

beforeAll(async () => {
    await init();
});

afterAll((done) => {
    db.close(done);
});

// Helper to clear activity events between tests
const clearActivityEvents = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM user_activity_events', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Helper to wait for rate limit to expire
const waitForRateLimit = () => new Promise(resolve => setTimeout(resolve, 5100));

describe('Activity Service', () => {
    beforeEach(async () => {
        await clearActivityEvents();
    });

    describe('logItemView', () => {
        it('should log an item view event', async () => {
            await logItemView(1, 5);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'ITEM_VIEW'`,
                    [1],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(1);
            expect(events[0].target_item_id).toBe(5);
            expect(events[0].event_type).toBe('ITEM_VIEW');
        });

        it('should rate-limit duplicate item views within 5 seconds', async () => {
            // First view should be logged
            await logItemView(1, 10);

            // Second view of same item should be skipped (rate limited)
            await logItemView(1, 10);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND target_item_id = ?`,
                    [1, 10],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            // Only one event should be recorded due to rate limiting
            expect(events.length).toBe(1);
        });

        it('should allow views of different items from same user', async () => {
            await logItemView(1, 20);
            await logItemView(1, 21);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ?`,
                    [1],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(2);
        });
    });

    describe('logSearch', () => {
        it('should log a search event with query', async () => {
            await logSearch(2, 'nintendo switch');

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'SEARCH'`,
                    [2],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(1);
            expect(events[0].search_query).toBe('nintendo switch');
        });

        it('should log a search with category filter', async () => {
            // Use different user to avoid rate limit from previous test
            await logSearch(3, 'games', 5);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'SEARCH'`,
                    [3],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(1);
            expect(events[0].category_id).toBe(5);
        });
    });

    describe('logTradeAbandoned', () => {
        it('should log a trade abandoned event with metadata', async () => {
            const metadata = { items_offered: [1, 2], stage: 'confirmation' };
            await logTradeAbandoned(1, 2, metadata);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'TRADE_ABANDONED'`,
                    [1],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(1);
            expect(events[0].target_user_id).toBe(2);
            expect(JSON.parse(events[0].metadata)).toEqual(metadata);
        });

        it('should NOT rate-limit trade abandoned events', async () => {
            // Trade abandonments are not rate-limited (important data)
            await logTradeAbandoned(1, 2);
            await logTradeAbandoned(1, 2);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'TRADE_ABANDONED'`,
                    [1],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(2);
        });
    });

    describe('logProfileView', () => {
        it('should log a profile view event', async () => {
            await logProfileView(1, 3);

            const events: any[] = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM user_activity_events WHERE user_id = ? AND event_type = 'PROFILE_VIEW'`,
                    [1],
                    (err, rows) => err ? reject(err) : resolve(rows as any[])
                );
            });

            expect(events.length).toBe(1);
            expect(events[0].target_user_id).toBe(3);
        });
    });

    describe('getRecentViews', () => {
        it('should return recently viewed item IDs in order', async () => {
            // Log views (need unique items to avoid rate limiting)
            await logItemView(3, 100);
            await logItemView(3, 101);
            await logItemView(3, 102);

            const recentViews = await getRecentViews(3, 10);

            expect(recentViews).toContain(100);
            expect(recentViews).toContain(101);
            expect(recentViews).toContain(102);
            expect(recentViews.length).toBe(3);
        });

        it('should respect limit parameter', async () => {
            await logItemView(4, 200);
            await logItemView(4, 201);
            await logItemView(4, 202);

            const recentViews = await getRecentViews(4, 2);

            expect(recentViews.length).toBe(2);
        });

        it('should return distinct items only', async () => {
            // First view
            await logItemView(5, 300);

            // Wait for rate limit to expire
            await waitForRateLimit();

            // Second view of same item
            await logItemView(5, 300);

            const recentViews = await getRecentViews(5, 10);

            // Should return distinct item IDs
            expect(recentViews.filter(id => id === 300).length).toBe(1);
        });
    });

    describe('getRecentSearches', () => {
        it('should return recent search queries', async () => {
            await logSearch(6, 'pokemon cards');

            // Wait for rate limit
            await waitForRateLimit();

            await logSearch(6, 'magic cards');

            const searches = await getRecentSearches(6, 10);

            expect(searches).toContain('pokemon cards');
            expect(searches).toContain('magic cards');
        });

        it('should return distinct queries only', async () => {
            await logSearch(7, 'test query');

            await waitForRateLimit();

            await logSearch(7, 'test query');

            const searches = await getRecentSearches(7, 10);

            expect(searches.filter(q => q === 'test query').length).toBe(1);
        });
    });

    describe('getActivityStats', () => {
        it('should return activity statistics for a user', async () => {
            // Clear and log some activity
            await logItemView(8, 400);
            await logItemView(8, 401);
            await logSearch(8, 'test');

            const stats = await getActivityStats(8);

            expect(stats).toHaveProperty('totalViews');
            expect(stats).toHaveProperty('totalSearches');
            expect(stats).toHaveProperty('uniqueItemsViewed');
            expect(stats.totalViews).toBeGreaterThanOrEqual(2);
            expect(stats.totalSearches).toBeGreaterThanOrEqual(1);
            expect(stats.uniqueItemsViewed).toBeGreaterThanOrEqual(2);
        });

        it('should return zeros for user with no activity', async () => {
            const stats = await getActivityStats(999);

            expect(stats.totalViews).toBe(0);
            expect(stats.totalSearches).toBe(0);
            expect(stats.uniqueItemsViewed).toBe(0);
        });
    });
});
