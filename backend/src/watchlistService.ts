import { db } from './database';

// Types for watchlist entries
export type WantType = 'SPECIFIC_ITEM' | 'SEARCH_TERM' | 'CATEGORY';

export interface UserWant {
    id: number;
    user_id: number;
    want_type: WantType;
    item_id?: number;
    search_term?: string;
    category_id?: number;
    min_price_cents?: number;
    max_price_cents?: number;
    notify_on_match: boolean;
    is_active: boolean;
    created_at: string;
    matched_at?: string;
    // Joined fields for display
    item_name?: string;
    item_image?: string;
    category_name?: string;
    owner_name?: string;
}

/**
 * Watch a specific item
 */
export const watchItem = (userId: number, itemId: number): Promise<UserWant> => {
    return new Promise((resolve, reject) => {
        // First check if user already watches this item
        db.get(
            `SELECT * FROM user_wants WHERE user_id = ? AND item_id = ? AND is_active = 1`,
            [userId, itemId],
            (err, existing: any) => {
                if (err) return reject(err);
                if (existing) {
                    return resolve(existing as UserWant);
                }

                // Check user doesn't own the item
                db.get(
                    `SELECT owner_id FROM Item WHERE id = ?`,
                    [itemId],
                    (err, item: any) => {
                        if (err) return reject(err);
                        if (!item) return reject(new Error('Item not found'));
                        if (item.owner_id === userId) {
                            return reject(new Error('Cannot watch your own item'));
                        }

                        // Create the watch
                        db.run(
                            `INSERT INTO user_wants (user_id, want_type, item_id) VALUES (?, ?, ?)`,
                            [userId, 'SPECIFIC_ITEM', itemId],
                            function (err) {
                                if (err) return reject(err);

                                db.get(
                                    `SELECT * FROM user_wants WHERE id = ?`,
                                    [this.lastID],
                                    (err, row: any) => {
                                        if (err) return reject(err);
                                        resolve(row as UserWant);
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
};

/**
 * Watch a category (optionally with price filters)
 */
export const watchCategory = (
    userId: number,
    categoryId: number,
    options?: { minPrice?: number; maxPrice?: number }
): Promise<UserWant> => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO user_wants (user_id, want_type, category_id, min_price_cents, max_price_cents) 
       VALUES (?, ?, ?, ?, ?)`,
            [userId, 'CATEGORY', categoryId, options?.minPrice || null, options?.maxPrice || null],
            function (err) {
                if (err) return reject(err);

                db.get(
                    `SELECT * FROM user_wants WHERE id = ?`,
                    [this.lastID],
                    (err, row: any) => {
                        if (err) return reject(err);
                        resolve(row as UserWant);
                    }
                );
            }
        );
    });
};

/**
 * Watch for items matching a search term
 */
export const watchSearchTerm = (userId: number, term: string): Promise<UserWant> => {
    return new Promise((resolve, reject) => {
        // Check for duplicate
        db.get(
            `SELECT * FROM user_wants WHERE user_id = ? AND search_term = ? AND is_active = 1`,
            [userId, term.toLowerCase()],
            (err, existing: any) => {
                if (err) return reject(err);
                if (existing) return resolve(existing as UserWant);

                db.run(
                    `INSERT INTO user_wants (user_id, want_type, search_term) VALUES (?, ?, ?)`,
                    [userId, 'SEARCH_TERM', term.toLowerCase()],
                    function (err) {
                        if (err) return reject(err);

                        db.get(
                            `SELECT * FROM user_wants WHERE id = ?`,
                            [this.lastID],
                            (err, row: any) => {
                                if (err) return reject(err);
                                resolve(row as UserWant);
                            }
                        );
                    }
                );
            }
        );
    });
};

/**
 * Stop watching an item
 */
export const unwatchItem = (userId: number, itemId: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE user_wants SET is_active = 0 WHERE user_id = ? AND item_id = ? AND is_active = 1`,
            [userId, itemId],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
};

/**
 * Remove a watch by ID
 */
export const removeWatch = (userId: number, watchId: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE user_wants SET is_active = 0 WHERE id = ? AND user_id = ?`,
            [watchId, userId],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            }
        );
    });
};

/**
 * Get all active watches for a user
 */
export const getWatchlist = (userId: number): Promise<UserWant[]> => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT 
         uw.*,
         i.name as item_name,
         i.imageUrl as item_image,
         u.name as owner_name,
         ic.name as category_name
       FROM user_wants uw
       LEFT JOIN Item i ON uw.item_id = i.id
       LEFT JOIN User u ON i.owner_id = u.id
       LEFT JOIN item_categories ic ON uw.category_id = ic.id
       WHERE uw.user_id = ? AND uw.is_active = 1
       ORDER BY uw.created_at DESC`,
            [userId],
            (err, rows: any[]) => {
                if (err) return reject(err);
                resolve(rows as UserWant[]);
            }
        );
    });
};

/**
 * Check if user is watching a specific item
 */
export const isWatching = (userId: number, itemId: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id FROM user_wants WHERE user_id = ? AND item_id = ? AND is_active = 1`,
            [userId, itemId],
            (err, row: any) => {
                if (err) return reject(err);
                resolve(!!row);
            }
        );
    });
};

/**
 * Find users who want a newly listed item
 * Called when a new item is listed to trigger notifications
 */
export const findMatchingWatchers = (itemId: number): Promise<number[]> => {
    return new Promise((resolve, reject) => {
        // Get item details first
        db.get(
            `SELECT id, name, category_id, estimatedMarketValue, owner_id FROM Item WHERE id = ?`,
            [itemId],
            (err, item: any) => {
                if (err) return reject(err);
                if (!item) return resolve([]);

                // Find users watching:
                // 1. This specific item (unlikely for new listing, but included)
                // 2. This category (with price in range if specified)
                // 3. Search terms that match item name
                db.all(
                    `SELECT DISTINCT uw.user_id
           FROM user_wants uw
           WHERE uw.is_active = 1 
             AND uw.notify_on_match = 1
             AND uw.user_id != ?
             AND (
               uw.item_id = ?
               OR (
                 uw.want_type = 'CATEGORY' 
                 AND uw.category_id = ?
                 AND (uw.min_price_cents IS NULL OR uw.min_price_cents <= ?)
                 AND (uw.max_price_cents IS NULL OR uw.max_price_cents >= ?)
               )
               OR (
                 uw.want_type = 'SEARCH_TERM'
                 AND LOWER(?) LIKE '%' || uw.search_term || '%'
               )
             )`,
                    [
                        item.owner_id,
                        itemId,
                        item.category_id,
                        item.estimatedMarketValue || 0,
                        item.estimatedMarketValue || 0,
                        (item.name || '').toLowerCase()
                    ],
                    (err, rows: any[]) => {
                        if (err) return reject(err);
                        resolve(rows.map(r => r.user_id));
                    }
                );
            }
        );
    });
};

/**
 * Get watch count for an item (for display purposes)
 */
export const getWatchCount = (itemId: number): Promise<number> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM user_wants WHERE item_id = ? AND is_active = 1`,
            [itemId],
            (err, row: any) => {
                if (err) return reject(err);
                resolve(row?.count || 0);
            }
        );
    });
};
