/**
 * Wishlist Match Service
 * Detects mutual trade opportunities based on wishlists
 */

import { db } from './database';
import { createNotification, NotificationType } from './notifications/notificationService';

export interface WishlistMatch {
    userId: number;
    userName: string;
    matchScore: number;
    theirWishlistItems: { id: number; name: string }[]; // Items YOU have that THEY want
    yourWishlistItems: { id: number; name: string }[];  // Items THEY have that YOU want
    reason: string;
}

/**
 * Find mutual matches for a user
 * A mutual match = they have items you want AND you have items they want
 */
export async function findMutualMatches(userId: number | string): Promise<WishlistMatch[]> {
    return new Promise((resolve, reject) => {
        const userIdNum = Number(userId);

        // Get user's wishlist and inventory
        db.all(`
            SELECT 
                w.itemId as wishlistItemId,
                i.owner_id as itemOwnerId,
                i.name as itemName
            FROM Wishlist w
            JOIN Item i ON w.itemId = i.id
            WHERE w.userId = ? AND i.owner_id != ?
        `, [userIdNum, userIdNum], (err: Error | null, myWishlistItems: any[]) => {
            if (err) return reject(err);

            // Get my inventory items
            db.all(`
                SELECT id, name FROM Item WHERE owner_id = ?
            `, [userIdNum], (err2: Error | null, myItems: any[]) => {
                if (err2) return reject(err2);

                if (myWishlistItems.length === 0 || myItems.length === 0) {
                    return resolve([]);
                }

                // Find users who have items I want
                const ownerIds = [...new Set(myWishlistItems.map(w => w.itemOwnerId))];
                const placeholders = ownerIds.map(() => '?').join(',');

                // Check if any of those users want my items
                db.all(`
                    SELECT 
                        w.userId as otherUserId,
                        w.itemId as theyWantItemId,
                        u.name as userName
                    FROM Wishlist w
                    JOIN User u ON w.userId = u.id
                    WHERE w.userId IN (${placeholders})
                    AND w.itemId IN (${myItems.map(() => '?').join(',')})
                `, [...ownerIds, ...myItems.map(i => i.id)], (err3: Error | null, theyWantMyItems: any[]) => {
                    if (err3) return reject(err3);

                    // Build matches
                    const matchMap = new Map<number, WishlistMatch>();

                    for (const row of theyWantMyItems) {
                        const otherUserId = row.otherUserId;

                        if (!matchMap.has(otherUserId)) {
                            // Find what items they have that I want
                            const itemsTheyHaveThatIWant = myWishlistItems
                                .filter(w => w.itemOwnerId === otherUserId)
                                .map(w => ({ id: w.wishlistItemId, name: w.itemName }));

                            matchMap.set(otherUserId, {
                                userId: otherUserId,
                                userName: row.userName,
                                matchScore: 0,
                                theirWishlistItems: [],
                                yourWishlistItems: itemsTheyHaveThatIWant,
                                reason: 'mutual_wish'
                            });
                        }

                        const match = matchMap.get(otherUserId)!;
                        const myItem = myItems.find(i => i.id === row.theyWantItemId);
                        if (myItem) {
                            match.theirWishlistItems.push({ id: myItem.id, name: myItem.name });
                        }
                    }

                    // Calculate match scores
                    for (const match of matchMap.values()) {
                        // Score: number of mutual items (both directions)
                        match.matchScore = match.theirWishlistItems.length + match.yourWishlistItems.length;
                    }

                    // Sort by score descending
                    const matches = Array.from(matchMap.values())
                        .sort((a, b) => b.matchScore - a.matchScore);

                    resolve(matches);
                });
            });
        });
    });
}

/**
 * Scan for matches when a new item is added
 * Notify users who have this item in their wishlist
 */
export async function notifyWishlistersOnNewItem(itemId: number, itemName: string, ownerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        // Find users who have this item in their wishlist
        db.all(`
            SELECT w.userId, u.name as userName
            FROM Wishlist w
            JOIN User u ON w.userId = u.id
            WHERE w.itemId = ? AND w.userId != ?
        `, [itemId, ownerId], async (err: Error | null, wishlisters: any[]) => {
            if (err) return reject(err);

            for (const row of wishlisters) {
                try {
                    await createNotification(
                        row.userId,
                        NotificationType.WISHLIST_ITEM_AVAILABLE,
                        '💫 Wishlist Item Available!',
                        `"${itemName}" is now available for trade!`,
                        null
                    );
                } catch (e) {
                    console.error('Failed to notify wishlister:', e);
                }
            }

            resolve();
        });
    });
}

/**
 * Scan for mutual matches and notify both parties
 */
export async function scanAndNotifyMutualMatches(userId: number): Promise<void> {
    try {
        const matches = await findMutualMatches(userId);

        // Import email service dynamically to avoid circular dependencies
        const { sendWishlistMatchEmail } = await import('./notifications/emailService');

        for (const match of matches) {
            // Only notify for strong matches (2+ mutual items)
            if (match.matchScore >= 2) {
                // Get current user info
                const currentUserData: any = await new Promise((resolve, reject) => {
                    db.get('SELECT id, name, email FROM User WHERE id = ?', [userId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                // Get match user info
                const matchUserData: any = await new Promise((resolve, reject) => {
                    db.get('SELECT id, name, email FROM User WHERE id = ?', [match.userId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (currentUserData && matchUserData) {
                    // Notify the current user (in-app)
                    await createNotification(
                        userId,
                        NotificationType.WISHLIST_MATCH_FOUND,
                        '🔥 Perfect Trade Match!',
                        `${match.userName} wants your items and has items you want!`,
                        null
                    );

                    // Email the current user
                    sendWishlistMatchEmail(
                        currentUserData.email,
                        currentUserData.name,
                        match.userName,
                        match.theirWishlistItems.map(i => i.name),
                        match.yourWishlistItems.map(i => i.name),
                        match.userId
                    ).catch(e => console.error('Email failed for user:', userId, e));

                    // Notify the other user (in-app)
                    await createNotification(
                        match.userId,
                        NotificationType.WISHLIST_MATCH_FOUND,
                        '🔥 Perfect Trade Match!',
                        `${currentUserData.name} wants your items and has items you want!`,
                        null
                    );

                    // Email the other user (swap perspective)
                    sendWishlistMatchEmail(
                        matchUserData.email,
                        matchUserData.name,
                        currentUserData.name,
                        match.yourWishlistItems.map(i => i.name),  // What current user wants = what match has
                        match.theirWishlistItems.map(i => i.name), // What current user offers = what match wants
                        userId
                    ).catch(e => console.error('Email failed for match user:', match.userId, e));
                }
            }
        }
    } catch (e) {
        console.error('Failed to scan for mutual matches:', e);
    }
}
