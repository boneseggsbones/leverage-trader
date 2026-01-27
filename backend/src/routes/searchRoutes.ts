import { Router } from 'express';
import { db } from '../database';

const router = Router();

// =====================================================
// ITEM SEARCH WITH FILTERS
// =====================================================

interface SearchParams {
    q?: string;
    category?: string;
    condition?: string;
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    state?: string;
    sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'relevance' | 'popularity';
    page?: number;
    limit?: number;
    excludeUserId?: string; // Exclude items from a specific user (e.g., current user)
}

// GET /api/search/items - Search items with filters
router.get('/items', async (req, res) => {
    try {
        const {
            q,
            category,
            condition,
            minPrice,
            maxPrice,
            city,
            state,
            sortBy = 'relevance',
            page = 1,
            limit = 20,
            excludeUserId
        } = req.query as unknown as SearchParams;

        // Build WHERE clauses
        const whereClauses: string[] = [];
        const params: any[] = [];

        // Text search on name and description
        if (q && typeof q === 'string' && q.trim()) {
            whereClauses.push('(i.name LIKE ? OR i.description LIKE ?)');
            const searchTerm = `%${q.trim()}%`;
            params.push(searchTerm, searchTerm);
        }

        // Category filter (match by category name - supports multiple comma-separated values with OR logic)
        if (category && typeof category === 'string') {
            const categories = category.split(',').map(c => c.trim()).filter(Boolean);
            if (categories.length === 1) {
                whereClauses.push('c.name = ?');
                params.push(categories[0]);
            } else if (categories.length > 1) {
                // OR logic: items matching ANY of the selected categories
                const placeholders = categories.map(() => '?').join(', ');
                whereClauses.push(`c.name IN (${placeholders})`);
                params.push(...categories);
            }
        }

        // Condition filter (supports multiple comma-separated values with OR logic)
        if (condition && typeof condition === 'string') {
            const conditions = condition.split(',').map(c => c.trim()).filter(Boolean);
            if (conditions.length === 1) {
                whereClauses.push('i.condition = ?');
                params.push(conditions[0]);
            } else if (conditions.length > 1) {
                // OR logic: items matching ANY of the selected conditions
                const placeholders = conditions.map(() => '?').join(', ');
                whereClauses.push(`i.condition IN (${placeholders})`);
                params.push(...conditions);
            }
        }

        // Price range
        if (minPrice !== undefined && !isNaN(Number(minPrice))) {
            whereClauses.push('i.estimatedMarketValue >= ?');
            params.push(Number(minPrice));
        }
        if (maxPrice !== undefined && !isNaN(Number(maxPrice))) {
            whereClauses.push('i.estimatedMarketValue <= ?');
            params.push(Number(maxPrice));
        }

        // Location filter (via user join)
        if (city && typeof city === 'string') {
            whereClauses.push('u.city LIKE ?');
            params.push(`%${city}%`);
        }
        if (state && typeof state === 'string') {
            whereClauses.push('u.state = ?');
            params.push(state);
        }

        // Exclude specific user's items
        if (excludeUserId) {
            whereClauses.push('i.owner_id != ?');
            params.push(excludeUserId);
        }

        // Build ORDER BY
        let orderBy = 'i.id DESC'; // default: newest
        switch (sortBy) {
            case 'price_asc':
                orderBy = 'i.estimatedMarketValue ASC NULLS LAST';
                break;
            case 'price_desc':
                orderBy = 'i.estimatedMarketValue DESC NULLS FIRST';
                break;
            case 'newest':
                orderBy = 'i.id DESC';
                break;
            case 'popularity':
                // Sort by owner's reputation score (higher = more popular)
                orderBy = 'u.valuationReputationScore DESC NULLS LAST, i.id DESC';
                break;
            case 'relevance':
            default:
                // If there's a search query, we could add relevance scoring
                // For now, just sort by newest
                orderBy = 'i.id DESC';
                break;
        }

        // Pagination
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
        const offset = (pageNum - 1) * limitNum;

        // Build the query
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // Count total results
        const countQuery = `
            SELECT COUNT(*) as total
            FROM Item i
            LEFT JOIN User u ON i.owner_id = u.id
            LEFT JOIN item_categories c ON i.category_id = c.id
            ${whereClause}
        `;

        // Get items with owner info
        const itemsQuery = `
            SELECT 
                i.*,
                c.name as category,
                u.id as owner_id,
                u.name as owner_name,
                u.city as owner_city,
                u.state as owner_state,
                u.valuationReputationScore as owner_reputation,
                u.profilePictureUrl as owner_avatar
            FROM Item i
            LEFT JOIN User u ON i.owner_id = u.id
            LEFT JOIN item_categories c ON i.category_id = c.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
        `;

        // Execute count query
        const countResult = await new Promise<any>((resolve, reject) => {
            db.get(countQuery, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        const total = countResult?.total || 0;

        // Execute items query
        const items = await new Promise<any[]>((resolve, reject) => {
            db.all(itemsQuery, [...params, limitNum, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });

        // Format response
        const formattedItems = items.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            condition: item.condition,
            estimatedMarketValue: item.estimatedMarketValue,
            imageUrl: item.imageUrl,
            valuationSource: item.valuationSource,
            owner: {
                id: item.owner_id,
                name: item.owner_name,
                city: item.owner_city,
                state: item.owner_state,
                valuationReputationScore: item.owner_reputation,
                profilePictureUrl: item.owner_avatar
            }
        }));

        res.json({
            items: formattedItems,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
                hasMore: offset + items.length < total
            },
            filters: {
                q: q || null,
                category: category || null,
                condition: condition || null,
                minPrice: minPrice || null,
                maxPrice: maxPrice || null,
                city: city || null,
                state: state || null,
                sortBy
            }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// GET /api/search/suggestions - Autocomplete suggestions
router.get('/suggestions', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string' || q.trim().length < 2) {
            return res.json({ suggestions: [] });
        }

        const searchTerm = `%${q.trim()}%`;

        // Get item name suggestions
        const items = await new Promise<any[]>((resolve, reject) => {
            db.all(
                `SELECT DISTINCT name FROM Item WHERE name LIKE ? LIMIT 8`,
                [searchTerm],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Get category suggestions that match
        const item_categories = ['VIDEO_GAMES', 'TCG', 'SNEAKERS', 'ELECTRONICS', 'OTHER'];
        const matchingCategories = item_categories.filter(cat =>
            cat.toLowerCase().includes(q.toLowerCase()) ||
            cat.replace('_', ' ').toLowerCase().includes(q.toLowerCase())
        );

        const suggestions = [
            ...items.map(i => ({ type: 'item', text: i.name })),
            ...matchingCategories.map(c => ({ type: 'category', text: c.replace('_', ' ') }))
        ].slice(0, 10);

        res.json({ suggestions });
    } catch (error) {
        console.error('Suggestions error:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});

// GET /api/search/stats - Get filter statistics (counts per category, condition, etc.)
router.get('/stats', async (req, res) => {
    try {
        const { excludeUserId } = req.query;

        const excludeClause = excludeUserId ? 'WHERE owner_id != ?' : '';
        const params = excludeUserId ? [excludeUserId] : [];

        // Get counts by category (join with item_categories table)
        const categoryStats = await new Promise<any[]>((resolve, reject) => {
            db.all(
                `SELECT c.name as category, COUNT(*) as count 
                 FROM Item i 
                 LEFT JOIN item_categories c ON i.category_id = c.id 
                 ${excludeUserId ? 'WHERE i.owner_id != ?' : ''}
                 GROUP BY i.category_id`,
                params,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Get counts by condition
        const conditionStats = await new Promise<any[]>((resolve, reject) => {
            db.all(
                `SELECT condition, COUNT(*) as count FROM Item ${excludeClause} GROUP BY condition`,
                params,
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        // Get price range
        const priceRange = await new Promise<any>((resolve, reject) => {
            db.get(
                `SELECT MIN(estimatedMarketValue) as minPrice, MAX(estimatedMarketValue) as maxPrice FROM Item ${excludeClause}`,
                params,
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || {});
                }
            );
        });

        res.json({
            categories: categoryStats,
            conditions: conditionStats,
            priceRange: {
                min: priceRange?.minPrice || 0,
                max: priceRange?.maxPrice || 100000
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

export default router;
