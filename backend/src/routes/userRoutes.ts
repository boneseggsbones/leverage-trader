import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database';
import { findTopMatches } from '../matchingService';
import { normalizeLocation } from '../locationUtils';
import { getCoordinates, calculateDistance } from '../distanceService';
import { getRecentViews, getRecentSearches } from '../activityService';
import { getWatchlist, removeWatch } from '../watchlistService';

const router = Router();

// =====================================================
// USER CRUD
// =====================================================

// Get all users with their inventory
router.get('/', async (req, res) => {
    try {
        const users: any[] = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM User', [], (err: Error | null, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const items: any[] = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM Item', [], (err: Error | null, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        const usersWithInventory = users.map(user => ({
            ...user,
            inventory: items.filter(item => item.owner_id === user.id)
        }));

        res.json(usersWithInventory);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single user by id
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    db.get('SELECT * FROM User WHERE id = ?', [id], (err: Error | null, row: any) => {
        if (err) {
            console.log(err);
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        db.all('SELECT * FROM Item WHERE owner_id = ?', [id], (err: Error | null, items: any[]) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            db.all('SELECT itemId FROM Wishlist WHERE userId = ?', [id], (err2: Error | null, wishlistRows: any[]) => {
                if (err2) {
                    res.status(500).json({ error: err2.message });
                    return;
                }
                const wishlist = wishlistRows.map((w: any) => w.itemId);
                res.json({ ...row, inventory: items, wishlist });
            });
        });
    });
});

// Create a new user (simple signup — demo only)
router.post('/', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });

    const hashed = bcrypt.hashSync(String(password), 10);

    db.run('INSERT INTO User (name, email, password, rating, avatarUrl, balance) VALUES (?, ?, ?, ?, ?, ?)', [name, email, hashed, 0, null, 0], function (err) {
        if (err) {
            if ((err as any).code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Email already registered' });
            return res.status(500).json({ error: err.message });
        }
        const id = this.lastID;
        db.get('SELECT * FROM User WHERE id = ?', [id], (err2, row) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ ...(row as any), inventory: [] });
        });
    });
});

// Update user profile
router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { name, city, state, location, aboutMe, phone } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }

    if (phone !== undefined) {
        updates.push('phone = ?');
        values.push(phone);
    }

    if (location !== undefined) {
        const parts = location.split(',').map((p: string) => p.trim());
        const normalized = normalizeLocation(parts[0], parts[1]);
        updates.push('city = ?');
        values.push(normalized.city);
        updates.push('state = ?');
        values.push(normalized.state);

        const coords = getCoordinates(null, normalized.city, normalized.state);
        if (coords) {
            updates.push('lat = ?');
            values.push(coords.lat);
            updates.push('lng = ?');
            values.push(coords.lng);
        }
    } else {
        if (city !== undefined || state !== undefined) {
            const normalized = normalizeLocation(city, state);
            if (city !== undefined) {
                updates.push('city = ?');
                values.push(normalized.city);
            }
            if (state !== undefined) {
                updates.push('state = ?');
                values.push(normalized.state);
            }

            const coords = getCoordinates(null, normalized.city, normalized.state);
            if (coords) {
                updates.push('lat = ?');
                values.push(coords.lat);
                updates.push('lng = ?');
                values.push(coords.lng);
            }
        }
    }

    if (aboutMe !== undefined) {
        updates.push('aboutMe = ?');
        values.push(aboutMe);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);

    db.run(
        `UPDATE User SET ${updates.join(', ')} WHERE id = ?`,
        values,
        function (err) {
            if (err) {
                console.error('[Profile] Error updating:', err);
                return res.status(500).json({ error: err.message });
            }

            db.get('SELECT * FROM User WHERE id = ?', [id], (err2: Error | null, row: any) => {
                if (err2 || !row) {
                    return res.status(500).json({ error: 'Failed to fetch updated user' });
                }
                db.all('SELECT * FROM Item WHERE owner_id = ?', [id], (err3: Error | null, items: any[]) => {
                    if (err3) {
                        return res.status(500).json({ error: err3.message });
                    }
                    console.log(`[Profile] Updated user ${id}`);
                    res.json({ ...row, inventory: items });
                });
            });
        }
    );
});

// =====================================================
// MATCHING
// =====================================================

// Get trade match suggestions for a user
router.get('/:userId/matches', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const limit = parseInt(req.query.limit as string, 10) || 10;

    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const matches = await findTopMatches(userId, limit);
        res.json({ matches });
    } catch (err: any) {
        console.error('Error finding matches:', err?.message || err);
        res.status(500).json({ error: 'Failed to find matches', details: err?.message });
    }
});

// Get mutual wishlist matches for a user
router.get('/:userId/wishlist-matches', async (req, res) => {
    const { userId } = req.params;

    try {
        const { findMutualMatches } = await import('../wishlistMatchService');
        const matches = await findMutualMatches(Number(userId));
        res.json(matches);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// =====================================================
// RATINGS
// =====================================================

// Get user's received ratings
router.get('/:id/ratings', (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    db.all(`
    SELECT tr.*, t.item1_id, t.item2_id, t.user1_id, t.user2_id,
           rater.name as raterName, rater.avatarUrl as raterAvatar
    FROM TradeRating tr
    JOIN Trade t ON tr.tradeId = t.id
    JOIN User rater ON tr.fromUserId = rater.id
    WHERE tr.toUserId = ?
    ORDER BY tr.createdAt DESC
  `, [userId], (err: Error | null, ratings: any[]) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(ratings || []);
    });
});

// =====================================================
// ACTIVITY & WATCHLIST
// =====================================================

// Get user activity (recent views, searches)
router.get('/:id/activity', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        const [recentViews, recentSearches] = await Promise.all([
            getRecentViews(userId, 20),
            getRecentSearches(userId, 10)
        ]);
        res.json({ recentViews, recentSearches });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Get user's watchlist
router.get('/:id/watchlist', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }
    try {
        const watchlist = await getWatchlist(userId);
        res.json(watchlist);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Remove item from watchlist
router.delete('/:id/watchlist/:watchId', async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const watchId = parseInt(req.params.watchId, 10);
    if (isNaN(userId) || isNaN(watchId)) {
        return res.status(400).json({ error: 'Invalid IDs' });
    }
    try {
        const removed = await removeWatch(userId, watchId);
        res.json({ success: removed });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
