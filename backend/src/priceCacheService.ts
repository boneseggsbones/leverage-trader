/**
 * Redis Price Cache Service
 * 
 * Implements Tier 1 "Fast" caching from the Gemini Deep Research architecture.
 * Provides sub-500ms response times for 80%+ of pricing lookups.
 * 
 * Cache Strategy:
 * - Product prices: 24 hour TTL (stable data like video games)
 * - Search results: 1 hour TTL (more volatile)
 * - TCG prices: 1 hour TTL (high volatility market)
 * - Sneaker prices: 30 min TTL (very volatile hype market)
 * 
 * Falls back gracefully when Redis is unavailable.
 */

import Redis from 'ioredis';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false'; // Default to true

// TTL values in seconds
const TTL = {
    PRODUCT_PRICE: 24 * 60 * 60,      // 24 hours - stable items
    SEARCH_RESULTS: 60 * 60,           // 1 hour - search queries
    TCG_PRICE: 60 * 60,                // 1 hour - trading cards
    SNEAKER_PRICE: 30 * 60,            // 30 min - sneakers/hype items
    EBAY_SOLD: 2 * 60 * 60,            // 2 hours - eBay sold data
    CONSOLIDATED: 60 * 60,             // 1 hour - consolidated valuations
};

// Cache key prefixes
const CACHE_PREFIX = {
    PRODUCT: 'price:product:',          // price:product:{productId}
    SEARCH: 'price:search:',            // price:search:{hash(query)}
    TCG: 'price:tcg:',                  // price:tcg:{cardId}
    SNEAKER: 'price:sneaker:',          // price:sneaker:{styleId}
    EBAY: 'price:ebay:',                // price:ebay:{hash(query)}
    CONSOLIDATED: 'price:consolidated:', // price:consolidated:{itemId}
    ITEM_VALUATION: 'price:item:',      // price:item:{itemId}
};

// Singleton Redis client
let redis: Redis | null = null;
let connectionAttempted = false;
let isConnected = false;

/**
 * Initialize Redis connection
 * Safe to call multiple times - only connects once
 */
export const initRedis = async (): Promise<boolean> => {
    if (!REDIS_ENABLED) {
        console.log('[Redis] Disabled via REDIS_ENABLED=false');
        return false;
    }

    if (connectionAttempted) {
        return isConnected;
    }

    connectionAttempted = true;

    try {
        redis = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log('[Redis] Max retries reached, giving up');
                    return null; // Stop retrying
                }
                return Math.min(times * 100, 2000);
            },
            lazyConnect: true,
        });

        redis.on('connect', () => {
            console.log('[Redis] ✅ Connected to', REDIS_URL);
            isConnected = true;
        });

        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err.message);
            isConnected = false;
        });

        redis.on('close', () => {
            console.log('[Redis] Connection closed');
            isConnected = false;
        });

        await redis.connect();
        return true;
    } catch (error: any) {
        console.log('[Redis] Failed to connect:', error.message);
        console.log('[Redis] Running without cache (fallback mode)');
        redis = null;
        return false;
    }
};

/**
 * Check if Redis is available
 */
export const isRedisConnected = (): boolean => {
    return isConnected && redis !== null;
};

/**
 * Get cached value
 * Returns null if not found or Redis unavailable
 */
export const getCached = async <T>(key: string): Promise<T | null> => {
    if (!isConnected || !redis) return null;

    try {
        const data = await redis.get(key);
        if (data) {
            console.log(`[Redis] Cache HIT: ${key.substring(0, 50)}...`);
            return JSON.parse(data) as T;
        }
        return null;
    } catch (error: any) {
        console.error('[Redis] Get error:', error.message);
        return null;
    }
};

/**
 * Set cached value with TTL
 */
export const setCached = async <T>(key: string, value: T, ttlSeconds: number): Promise<boolean> => {
    if (!isConnected || !redis) return false;

    try {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
        console.log(`[Redis] Cache SET: ${key.substring(0, 50)}... (TTL: ${ttlSeconds}s)`);
        return true;
    } catch (error: any) {
        console.error('[Redis] Set error:', error.message);
        return false;
    }
};

/**
 * Delete cached value (for invalidation)
 */
export const deleteCached = async (key: string): Promise<boolean> => {
    if (!isConnected || !redis) return false;

    try {
        await redis.del(key);
        return true;
    } catch (error: any) {
        console.error('[Redis] Delete error:', error.message);
        return false;
    }
};

/**
 * Delete all keys matching a pattern
 * Useful for invalidating all prices for an item
 */
export const deleteByPattern = async (pattern: string): Promise<number> => {
    if (!isConnected || !redis) return 0;

    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
        return keys.length;
    } catch (error: any) {
        console.error('[Redis] Pattern delete error:', error.message);
        return 0;
    }
};

/**
 * Create a hash for search queries (for cache keys)
 */
export const hashQuery = (query: string): string => {
    // Simple hash for cache key - normalize and hash
    const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
};

// ============================================
// High-level caching functions for pricing
// ============================================

/**
 * Cache wrapper for product prices (PriceCharting, etc.)
 */
export const cacheProductPrice = async (
    productId: string,
    provider: string,
    data: any
): Promise<void> => {
    const key = `${CACHE_PREFIX.PRODUCT}${provider}:${productId}`;
    await setCached(key, data, TTL.PRODUCT_PRICE);
};

export const getCachedProductPrice = async <T>(
    productId: string,
    provider: string
): Promise<T | null> => {
    const key = `${CACHE_PREFIX.PRODUCT}${provider}:${productId}`;
    return getCached<T>(key);
};

/**
 * Cache wrapper for search results
 */
export const cacheSearchResults = async (
    query: string,
    category: string | undefined,
    results: any
): Promise<void> => {
    const key = `${CACHE_PREFIX.SEARCH}${hashQuery(query)}:${category || 'all'}`;
    await setCached(key, results, TTL.SEARCH_RESULTS);
};

export const getCachedSearchResults = async <T>(
    query: string,
    category: string | undefined
): Promise<T | null> => {
    const key = `${CACHE_PREFIX.SEARCH}${hashQuery(query)}:${category || 'all'}`;
    return getCached<T>(key);
};

/**
 * Cache wrapper for eBay sold data
 */
export const cacheEbaySoldPrice = async (
    query: string,
    data: any
): Promise<void> => {
    const key = `${CACHE_PREFIX.EBAY}${hashQuery(query)}`;
    await setCached(key, data, TTL.EBAY_SOLD);
};

export const getCachedEbaySoldPrice = async <T>(
    query: string
): Promise<T | null> => {
    const key = `${CACHE_PREFIX.EBAY}${hashQuery(query)}`;
    return getCached<T>(key);
};

/**
 * Cache wrapper for TCG card prices
 */
export const cacheTcgPrice = async (
    cardId: string,
    data: any
): Promise<void> => {
    const key = `${CACHE_PREFIX.TCG}${cardId}`;
    await setCached(key, data, TTL.TCG_PRICE);
};

export const getCachedTcgPrice = async <T>(
    cardId: string
): Promise<T | null> => {
    const key = `${CACHE_PREFIX.TCG}${cardId}`;
    return getCached<T>(key);
};

/**
 * Cache wrapper for consolidated item valuations
 */
export const cacheConsolidatedValuation = async (
    itemId: number,
    data: any
): Promise<void> => {
    const key = `${CACHE_PREFIX.CONSOLIDATED}${itemId}`;
    await setCached(key, data, TTL.CONSOLIDATED);
};

export const getCachedConsolidatedValuation = async <T>(
    itemId: number
): Promise<T | null> => {
    const key = `${CACHE_PREFIX.CONSOLIDATED}${itemId}`;
    return getCached<T>(key);
};

/**
 * Invalidate all cached prices for an item
 * Called when item is updated, linked to new product, etc.
 */
export const invalidateItemCache = async (itemId: number): Promise<void> => {
    await deleteByPattern(`${CACHE_PREFIX.CONSOLIDATED}${itemId}`);
    await deleteByPattern(`${CACHE_PREFIX.ITEM_VALUATION}${itemId}`);
};

/**
 * Get cache statistics for monitoring
 */
export const getCacheStats = async (): Promise<{
    connected: boolean;
    keyCount: number;
    memoryUsed: string;
} | null> => {
    if (!isConnected || !redis) {
        return { connected: false, keyCount: 0, memoryUsed: '0' };
    }

    try {
        const info = await redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:(\S+)/);
        const keyCount = await redis.dbsize();

        return {
            connected: true,
            keyCount,
            memoryUsed: memoryMatch ? memoryMatch[1] : 'unknown',
        };
    } catch (error) {
        return { connected: false, keyCount: 0, memoryUsed: '0' };
    }
};

/**
 * Graceful shutdown
 */
export const closeRedis = async (): Promise<void> => {
    if (redis) {
        await redis.quit();
        redis = null;
        isConnected = false;
        console.log('[Redis] Connection closed gracefully');
    }
};

// Export TTL constants for external use
export { TTL, CACHE_PREFIX };
