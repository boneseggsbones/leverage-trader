/**
 * Trade Matching Service
 * 
 * Calculates match scores between users based on:
 * - Wishlist overlap (40%)
 * - Value balance (30%)
 * - Category affinity (20%)
 * - Location proximity (10%)
 */

import { db } from './database';

export interface MatchReason {
    type: 'wishlist_theirs' | 'wishlist_yours' | 'value_balance' | 'category' | 'location';
    description: string;
    score: number;
}

export interface TradeMatch {
    userId: number;
    userName: string;
    score: number;
    tier: 'hot' | 'good' | 'explore';
    reasons: MatchReason[];
    // Summary data for UI
    theirWishlistMatchCount: number;
    yourWishlistMatchCount: number;
    sharedCategories: string[];
    isNearby: boolean;
}

interface UserData {
    id: number;
    name: string;
    city: string | null;
    state: string | null;
    inventory: ItemData[];
    wishlist: number[];
}

interface ItemData {
    id: number;
    name: string;
    category_id: number | null;
    estimatedMarketValue: number;
}

/**
 * Get all data needed for matching
 */
async function getUserDataForMatching(userId: number): Promise<UserData | null> {
    return new Promise((resolve, reject) => {
        db.get('SELECT id, name, city, state FROM User WHERE id = ?', [userId], (err, user: any) => {
            if (err) return reject(err);
            if (!user) return resolve(null);

            // Get inventory
            db.all('SELECT id, name, category_id, estimatedMarketValue FROM Item WHERE owner_id = ?', [userId], (err2, items: any[]) => {
                if (err2) return reject(err2);

                // Get wishlist
                db.all('SELECT itemId FROM Wishlist WHERE userId = ?', [userId], (err3, wishlistRows: any[]) => {
                    if (err3) return reject(err3);

                    resolve({
                        id: user.id,
                        name: user.name,
                        city: user.city,
                        state: user.state,
                        inventory: items || [],
                        wishlist: (wishlistRows || []).map(w => w.itemId)
                    });
                });
            });
        });
    });
}

/**
 * Get all users except the given one
 */
async function getAllOtherUsers(excludeUserId: number): Promise<UserData[]> {
    return new Promise((resolve, reject) => {
        db.all('SELECT id FROM User WHERE id != ?', [excludeUserId], (err, users: any[]) => {
            if (err) return reject(err);
            if (!users || users.length === 0) return resolve([]);

            const userDataPromises = users.map(u => getUserDataForMatching(u.id));
            Promise.all(userDataPromises)
                .then(allUserData => {
                    resolve(allUserData.filter((u): u is UserData => u !== null));
                })
                .catch(reject);
        });
    });
}

/**
 * Calculate match score between two users
 */
function calculateMatchScore(currentUser: UserData, otherUser: UserData): TradeMatch {
    const reasons: MatchReason[] = [];
    let totalScore = 0;

    const currentInventoryIds = new Set(currentUser.inventory.map(i => i.id));
    const otherInventoryIds = new Set(otherUser.inventory.map(i => i.id));

    // --- WISHLIST MATCH (40% weight) ---
    // Items in your inventory that they want
    const theirWishlistMatches = currentUser.inventory.filter(item =>
        otherUser.wishlist.includes(item.id)
    );

    // Items in their inventory that you want
    const yourWishlistMatches = otherUser.inventory.filter(item =>
        currentUser.wishlist.includes(item.id)
    );

    const wishlistScore = Math.min(40,
        (theirWishlistMatches.length * 15) + (yourWishlistMatches.length * 15)
    );
    totalScore += wishlistScore;

    if (theirWishlistMatches.length > 0) {
        reasons.push({
            type: 'wishlist_theirs',
            description: `Has ${theirWishlistMatches.length} item${theirWishlistMatches.length > 1 ? 's' : ''} on your wishlist`,
            score: yourWishlistMatches.length * 15
        });
    }

    if (yourWishlistMatches.length > 0) {
        const itemNames = yourWishlistMatches.slice(0, 2).map(i => i.name).join(', ');
        reasons.push({
            type: 'wishlist_yours',
            description: `Wants your ${itemNames}${yourWishlistMatches.length > 2 ? ` +${yourWishlistMatches.length - 2} more` : ''}`,
            score: theirWishlistMatches.length * 15
        });
    }

    // --- VALUE BALANCE (30% weight) ---
    const currentTotalValue = currentUser.inventory.reduce((sum, i) => sum + (i.estimatedMarketValue || 0), 0);
    const otherTotalValue = otherUser.inventory.reduce((sum, i) => sum + (i.estimatedMarketValue || 0), 0);

    if (currentTotalValue > 0 && otherTotalValue > 0) {
        const ratio = Math.min(currentTotalValue, otherTotalValue) / Math.max(currentTotalValue, otherTotalValue);
        const valueScore = Math.round(ratio * 30);
        totalScore += valueScore;

        if (valueScore >= 20) {
            const minVal = Math.min(currentTotalValue, otherTotalValue) / 100;
            const maxVal = Math.max(currentTotalValue, otherTotalValue) / 100;
            reasons.push({
                type: 'value_balance',
                description: `Similar collection value ($${minVal.toFixed(0)}-$${maxVal.toFixed(0)})`,
                score: valueScore
            });
        }
    }

    // --- CATEGORY AFFINITY (20% weight) ---
    const currentCategories = new Set(currentUser.inventory.map(i => i.category_id).filter(c => c != null));
    const otherCategories = new Set(otherUser.inventory.map(i => i.category_id).filter(c => c != null));

    const sharedCategories = [...currentCategories].filter(c => otherCategories.has(c));
    const categoryScore = Math.min(20, sharedCategories.length * 10);
    totalScore += categoryScore;

    if (sharedCategories.length > 0) {
        reasons.push({
            type: 'category',
            description: `Trades in ${sharedCategories.length} shared categor${sharedCategories.length > 1 ? 'ies' : 'y'}`,
            score: categoryScore
        });
    }

    // --- LOCATION PROXIMITY (10% weight) ---
    const isNearby = currentUser.city && otherUser.city &&
        currentUser.state && otherUser.state &&
        (currentUser.city.toLowerCase() === otherUser.city.toLowerCase() ||
            currentUser.state.toUpperCase() === otherUser.state.toUpperCase());

    if (isNearby) {
        totalScore += 10;
        reasons.push({
            type: 'location',
            description: currentUser.city?.toLowerCase() === otherUser.city?.toLowerCase()
                ? `Same city (${otherUser.city})`
                : `Same state (${otherUser.state})`,
            score: 10
        });
    }

    // Determine tier
    let tier: 'hot' | 'good' | 'explore';
    if (totalScore >= 80) tier = 'hot';
    else if (totalScore >= 50) tier = 'good';
    else tier = 'explore';

    return {
        userId: otherUser.id,
        userName: otherUser.name,
        score: totalScore,
        tier,
        reasons,
        theirWishlistMatchCount: theirWishlistMatches.length,
        yourWishlistMatchCount: yourWishlistMatches.length,
        sharedCategories: sharedCategories.map(String),
        isNearby: !!isNearby
    };
}

/**
 * Find top trade matches for a user
 */
export async function findTopMatches(userId: number, limit: number = 10): Promise<TradeMatch[]> {
    const currentUser = await getUserDataForMatching(userId);
    if (!currentUser) return [];

    const otherUsers = await getAllOtherUsers(userId);

    const matches = otherUsers
        .map(other => calculateMatchScore(currentUser, other))
        .filter(match => match.score >= 10) // Minimum threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return matches;
}
