import { db } from './database';

// Event types for activity tracking
export type ActivityEventType =
    | 'ITEM_VIEW'
    | 'SEARCH'
    | 'TRADE_STARTED'
    | 'TRADE_ABANDONED'
    | 'PROFILE_VIEW';

export interface ActivityEvent {
    id: number;
    user_id: number;
    event_type: ActivityEventType;
    target_item_id?: number;
    target_user_id?: number;
    search_query?: string;
    category_id?: number;
    metadata?: string;
    created_at: string;
}

// Rate limiting: track recent events to prevent spam
const recentEvents = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // 5 seconds between duplicate events

function makeEventKey(userId: number, eventType: string, targetId?: number): string {
    return `${userId}:${eventType}:${targetId || ''}`;
}

function isRateLimited(key: string): boolean {
    const lastTime = recentEvents.get(key);
    if (lastTime && Date.now() - lastTime < RATE_LIMIT_MS) {
        return true;
    }
    recentEvents.set(key, Date.now());
    return false;
}

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, time] of recentEvents.entries()) {
        if (now - time > RATE_LIMIT_MS * 2) {
            recentEvents.delete(key);
        }
    }
}, 60000); // Clean every minute

/**
 * Log when a user views an item
 */
export const logItemView = (userId: number, itemId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        const key = makeEventKey(userId, 'ITEM_VIEW', itemId);
        if (isRateLimited(key)) {
            return resolve(); // Silently skip rate-limited events
        }

        db.run(
            `INSERT INTO user_activity_events (user_id, event_type, target_item_id) VALUES (?, ?, ?)`,
            [userId, 'ITEM_VIEW', itemId],
            (err) => {
                if (err) {
                    console.error('Error logging item view:', err);
                    return reject(err);
                }
                resolve();
            }
        );
    });
};

/**
 * Log when a user performs a search
 */
export const logSearch = (
    userId: number,
    query: string,
    categoryId?: number
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const key = makeEventKey(userId, 'SEARCH');
        if (isRateLimited(key)) {
            return resolve();
        }

        db.run(
            `INSERT INTO user_activity_events (user_id, event_type, search_query, category_id) VALUES (?, ?, ?, ?)`,
            [userId, 'SEARCH', query, categoryId || null],
            (err) => {
                if (err) {
                    console.error('Error logging search:', err);
                    return reject(err);
                }
                resolve();
            }
        );
    });
};

/**
 * Log when a user starts but abandons a trade
 */
export const logTradeAbandoned = (
    userId: number,
    targetUserId: number,
    metadata?: object
): Promise<void> => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO user_activity_events (user_id, event_type, target_user_id, metadata) VALUES (?, ?, ?, ?)`,
            [userId, 'TRADE_ABANDONED', targetUserId, metadata ? JSON.stringify(metadata) : null],
            (err) => {
                if (err) {
                    console.error('Error logging trade abandoned:', err);
                    return reject(err);
                }
                resolve();
            }
        );
    });
};

/**
 * Log when a user views another user's profile
 */
export const logProfileView = (userId: number, targetUserId: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        const key = makeEventKey(userId, 'PROFILE_VIEW', targetUserId);
        if (isRateLimited(key)) {
            return resolve();
        }

        db.run(
            `INSERT INTO user_activity_events (user_id, event_type, target_user_id) VALUES (?, ?, ?)`,
            [userId, 'PROFILE_VIEW', targetUserId],
            (err) => {
                if (err) {
                    console.error('Error logging profile view:', err);
                    return reject(err);
                }
                resolve();
            }
        );
    });
};

/**
 * Get recently viewed items for a user
 */
export const getRecentViews = (userId: number, limit: number = 10): Promise<number[]> => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT target_item_id 
       FROM user_activity_events 
       WHERE user_id = ? AND event_type = 'ITEM_VIEW' AND target_item_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`,
            [userId, limit],
            (err, rows: any[]) => {
                if (err) {
                    console.error('Error getting recent views:', err);
                    return reject(err);
                }
                resolve(rows.map(r => r.target_item_id));
            }
        );
    });
};

/**
 * Get recent searches for a user
 */
export const getRecentSearches = (userId: number, limit: number = 10): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT DISTINCT search_query 
       FROM user_activity_events 
       WHERE user_id = ? AND event_type = 'SEARCH' AND search_query IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`,
            [userId, limit],
            (err, rows: any[]) => {
                if (err) {
                    console.error('Error getting recent searches:', err);
                    return reject(err);
                }
                resolve(rows.map(r => r.search_query));
            }
        );
    });
};

/**
 * Get activity stats for analytics
 */
export const getActivityStats = (userId: number): Promise<{
    totalViews: number;
    totalSearches: number;
    uniqueItemsViewed: number;
}> => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 
         COUNT(CASE WHEN event_type = 'ITEM_VIEW' THEN 1 END) as totalViews,
         COUNT(CASE WHEN event_type = 'SEARCH' THEN 1 END) as totalSearches,
         COUNT(DISTINCT CASE WHEN event_type = 'ITEM_VIEW' THEN target_item_id END) as uniqueItemsViewed
       FROM user_activity_events
       WHERE user_id = ?`,
            [userId],
            (err, row: any) => {
                if (err) {
                    console.error('Error getting activity stats:', err);
                    return reject(err);
                }
                resolve({
                    totalViews: row?.totalViews || 0,
                    totalSearches: row?.totalSearches || 0,
                    uniqueItemsViewed: row?.uniqueItemsViewed || 0
                });
            }
        );
    });
};
