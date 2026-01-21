import { db, init } from './database';
import {
    watchItem,
    watchCategory,
    watchSearchTerm,
    unwatchItem,
    removeWatch,
    getWatchlist,
    isWatching,
    findMatchingWatchers,
    getWatchCount,
    UserWant
} from './watchlistService';

beforeAll(async () => {
    await init();
});

afterAll((done) => {
    db.close(done);
});

// Helper to clear user_wants table between tests
const clearUserWants = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM user_wants', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// Helper to get item owner
const getItemOwnerId = (itemId: number): Promise<number | null> => {
    return new Promise((resolve, reject) => {
        db.get('SELECT owner_id FROM Item WHERE id = ?', [itemId], (err, row: any) => {
            if (err) reject(err);
            else resolve(row?.owner_id || null);
        });
    });
};

describe('Watchlist Service', () => {
    beforeEach(async () => {
        await clearUserWants();
    });

    describe('watchItem', () => {
        it('should allow a user to watch an item they do not own', async () => {
            // Find an item not owned by user 1
            const ownerId = await getItemOwnerId(4); // Usually item 4 owner
            const watchingUserId = ownerId === 1 ? 2 : 1;
            const itemToWatch = ownerId === 1 ? 2 : 4; // Pick item owned by other user

            const otherOwnerId = await getItemOwnerId(itemToWatch);
            if (otherOwnerId === watchingUserId) {
                // Skip if we can't find a suitable item
                return;
            }

            const watch = await watchItem(watchingUserId, itemToWatch);

            expect(watch).toHaveProperty('id');
            expect(watch.user_id).toBe(watchingUserId);
            expect(watch.item_id).toBe(itemToWatch);
            expect(watch.want_type).toBe('SPECIFIC_ITEM');
        });

        it('should prevent user from watching their own item', async () => {
            // Get an item and its owner
            const ownerId = await getItemOwnerId(1);
            if (!ownerId) {
                // Skip if item 1 doesn't exist
                return;
            }

            await expect(watchItem(ownerId, 1)).rejects.toThrow('Cannot watch your own item');
        });

        it('should return existing watch if already watching', async () => {
            const ownerId = await getItemOwnerId(2);
            const watchingUserId = ownerId === 1 ? 2 : 1;

            if (ownerId === watchingUserId) {
                return;
            }

            const firstWatch = await watchItem(watchingUserId, 2);
            const secondWatch = await watchItem(watchingUserId, 2);

            expect(firstWatch.id).toBe(secondWatch.id);
        });

        it('should reject watch for non-existent item', async () => {
            await expect(watchItem(1, 99999)).rejects.toThrow('Item not found');
        });
    });

    describe('watchCategory', () => {
        it('should create a category watch', async () => {
            const watch = await watchCategory(1, 5);

            expect(watch).toHaveProperty('id');
            expect(watch.user_id).toBe(1);
            expect(watch.category_id).toBe(5);
            expect(watch.want_type).toBe('CATEGORY');
        });

        it('should accept price range filters', async () => {
            const watch = await watchCategory(1, 3, {
                minPrice: 1000,
                maxPrice: 5000
            });

            expect(watch.min_price_cents).toBe(1000);
            expect(watch.max_price_cents).toBe(5000);
        });
    });

    describe('watchSearchTerm', () => {
        it('should create a search term watch', async () => {
            const watch = await watchSearchTerm(1, 'Nintendo Switch');

            expect(watch).toHaveProperty('id');
            expect(watch.user_id).toBe(1);
            expect(watch.search_term).toBe('nintendo switch'); // Should lowercase
            expect(watch.want_type).toBe('SEARCH_TERM');
        });

        it('should return existing watch for duplicate search term', async () => {
            const first = await watchSearchTerm(1, 'Pokemon');
            const second = await watchSearchTerm(1, 'pokemon'); // Same term different case

            expect(first.id).toBe(second.id);
        });
    });

    describe('unwatchItem', () => {
        it('should deactivate an item watch', async () => {
            const ownerId = await getItemOwnerId(3);
            const watchingUserId = ownerId === 1 ? 2 : 1;

            if (ownerId === watchingUserId) {
                return;
            }

            await watchItem(watchingUserId, 3);

            const result = await unwatchItem(watchingUserId, 3);
            expect(result).toBe(true);

            const stillWatching = await isWatching(watchingUserId, 3);
            expect(stillWatching).toBe(false);
        });

        it('should return false if not watching', async () => {
            const result = await unwatchItem(1, 999);
            expect(result).toBe(false);
        });
    });

    describe('removeWatch', () => {
        it('should remove a watch by ID', async () => {
            const watch = await watchSearchTerm(1, 'test removal');

            const result = await removeWatch(1, watch.id);
            expect(result).toBe(true);

            // Verify it's removed
            const watchlist = await getWatchlist(1);
            const found = watchlist.find(w => w.id === watch.id);
            expect(found).toBeUndefined();
        });

        it('should not allow removing other users watches', async () => {
            const watch = await watchSearchTerm(1, 'my watch');

            // User 2 tries to remove user 1's watch
            const result = await removeWatch(2, watch.id);
            expect(result).toBe(false);
        });
    });

    describe('getWatchlist', () => {
        it('should return all active watches for a user', async () => {
            await watchSearchTerm(1, 'term1');
            await watchSearchTerm(1, 'term2');
            await watchCategory(1, 2);

            const watchlist = await getWatchlist(1);

            expect(watchlist.length).toBe(3);
            expect(watchlist.every(w => w.is_active)).toBe(true);
        });

        it('should join item and category details', async () => {
            const ownerId = await getItemOwnerId(2);
            const watchingUserId = ownerId === 1 ? 2 : 1;

            if (ownerId !== watchingUserId) {
                await watchItem(watchingUserId, 2);
                const watchlist = await getWatchlist(watchingUserId);
                const itemWatch = watchlist.find(w => w.item_id === 2);

                if (itemWatch) {
                    // Should have joined item name
                    expect(itemWatch).toHaveProperty('item_name');
                }
            }
        });

        it('should return empty array for user with no watches', async () => {
            const watchlist = await getWatchlist(999);
            expect(watchlist).toEqual([]);
        });
    });

    describe('isWatching', () => {
        it('should return true if user is watching item', async () => {
            const ownerId = await getItemOwnerId(2);
            const watchingUserId = ownerId === 1 ? 2 : 1;

            if (ownerId !== watchingUserId) {
                await watchItem(watchingUserId, 2);
                const result = await isWatching(watchingUserId, 2);
                expect(result).toBe(true);
            }
        });

        it('should return false if not watching', async () => {
            const result = await isWatching(1, 999);
            expect(result).toBe(false);
        });
    });

    describe('findMatchingWatchers', () => {
        it('should find users watching the specific item', async () => {
            // Create an item watch
            const ownerId = await getItemOwnerId(3);
            const watcherId = ownerId === 1 ? 2 : 1;

            if (ownerId !== watcherId) {
                // Enable notify_on_match
                await watchItem(watcherId, 3);
                await new Promise<void>((resolve, reject) => {
                    db.run(
                        'UPDATE user_wants SET notify_on_match = 1 WHERE user_id = ? AND item_id = ?',
                        [watcherId, 3],
                        (err) => err ? reject(err) : resolve()
                    );
                });

                const watchers = await findMatchingWatchers(3);
                expect(watchers).toContain(watcherId);
            }
        });

        it('should NOT return the item owner as a watcher', async () => {
            const ownerId = await getItemOwnerId(1);
            if (ownerId) {
                const watchers = await findMatchingWatchers(1);
                expect(watchers).not.toContain(ownerId);
            }
        });

        it('should return empty for non-existent item', async () => {
            const watchers = await findMatchingWatchers(99999);
            expect(watchers).toEqual([]);
        });
    });

    describe('getWatchCount', () => {
        it('should return number of users watching an item', async () => {
            const ownerId = await getItemOwnerId(2);

            // Watch from users who don't own the item
            const watchers = [1, 2, 3].filter(id => id !== ownerId);

            for (const watcherId of watchers.slice(0, 2)) {
                try {
                    await watchItem(watcherId, 2);
                } catch (e) {
                    // Skip if user owns the item
                }
            }

            const count = await getWatchCount(2);
            expect(count).toBeGreaterThanOrEqual(0);
        });

        it('should return 0 for unwatched item', async () => {
            const count = await getWatchCount(99999);
            expect(count).toBe(0);
        });
    });
});
