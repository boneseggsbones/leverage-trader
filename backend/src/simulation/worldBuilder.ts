/**
 * World Builder - Simulation Engine for Integration Testing
 * 
 * Creates realistic test scenarios with users, items, and wishlists
 * to validate chain matching, distance scoring, and valuation algorithms.
 */

import { dbRun, dbGet, createTestUser, createTestItem } from '../testUtils';
import { KNOWN_ZIP_CODES } from '../distanceService';

// Inline random generators (avoiding faker-js ESM issues)
function randomFromArray<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomId(): string {
    return Math.random().toString(36).substring(2, 10);
}

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Charlie', 'Jamie', 'Drew', 'Blake', 'Skyler', 'Dakota', 'Reese', 'Finley', 'Hayden', 'Peyton', 'Cameron', 'Emery'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White'];

function randomName(): string {
    return `${randomFromArray(FIRST_NAMES)} ${randomFromArray(LAST_NAMES)}`;
}

function randomEmail(prefix: string = 'sim'): string {
    return `${prefix}_${randomId()}@test.sim`;
}

function randomDescription(): string {
    const adjectives = ['Excellent', 'Mint', 'Near-mint', 'Good', 'Fair', 'Rare', 'Vintage', 'Limited', 'Special'];
    const conditions = ['condition', 'quality', 'state', 'edition'];
    return `${randomFromArray(adjectives)} ${randomFromArray(conditions)}. Great for collectors.`;
}

// Pick a random zip code from our known list
function randomZipCode(): string {
    return KNOWN_ZIP_CODES[Math.floor(Math.random() * KNOWN_ZIP_CODES.length)];
}

// Item categories for realistic variety
const ITEM_CATEGORIES = [
    { prefix: 'Vintage', names: ['Pokemon Card', 'Baseball Card', 'Comic Book', 'Action Figure', 'Toy Car'] },
    { prefix: 'Rare', names: ['Vinyl Record', 'Coin', 'Stamp', 'Watch', 'Camera'] },
    { prefix: 'Limited Edition', names: ['Sneakers', 'Art Print', 'Figurine', 'Jersey', 'Book'] },
    { prefix: 'Collectible', names: ['Lego Set', 'Board Game', 'Video Game', 'Console', 'Trading Cards'] },
];

function randomItemName(): string {
    const category = ITEM_CATEGORIES[Math.floor(Math.random() * ITEM_CATEGORIES.length)];
    const name = category.names[Math.floor(Math.random() * category.names.length)];
    return `${category.prefix} ${name} ${randomId().substring(0, 4).toUpperCase()}`;
}

// Value tiers to create realistic imbalances
const VALUE_TIERS = {
    low: { min: 500, max: 2500 },      // $5 - $25
    mid: { min: 2500, max: 10000 },    // $25 - $100
    high: { min: 10000, max: 50000 },  // $100 - $500
    premium: { min: 50000, max: 250000 }, // $500 - $2500
};

function randomValue(tier: keyof typeof VALUE_TIERS = 'mid'): number {
    const { min, max } = VALUE_TIERS[tier];
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface SimulatedUser {
    id: number;
    name: string;
    email: string;
    zipCode: string;
    isPro: boolean;
}

export interface SimulatedItem {
    id: number;
    name: string;
    ownerId: number;
    value: number;
}

export interface ChainRing {
    users: SimulatedUser[];
    items: SimulatedItem[];
}

/**
 * WorldBuilder class for creating simulation scenarios
 */
export class WorldBuilder {
    users: SimulatedUser[] = [];
    items: SimulatedItem[] = [];
    private userCounter = 0;

    /**
     * Reset the world state (use between tests)
     */
    reset(): void {
        this.users = [];
        this.items = [];
        this.userCounter = 0;
    }

    /**
     * Create a cluster of users in a specific geographic area
     * Use this to test distance-based scoring and local matching
     */
    async seedLocalCluster(count: number, zipCode: string): Promise<SimulatedUser[]> {
        console.log(`[World] Seeding ${count} users in ${zipCode}...`);
        const clusterUsers: SimulatedUser[] = [];

        for (let i = 0; i < count; i++) {
            const user = await this.createUser({ zipCode });
            clusterUsers.push(user);
        }

        console.log(`[World] ✓ Created ${clusterUsers.length} users in cluster`);
        return clusterUsers;
    }

    /**
     * Create random users spread across different locations
     * Use this to add "noise" to the system
     */
    async seedRandomUsers(count: number): Promise<SimulatedUser[]> {
        console.log(`[World] Seeding ${count} random users...`);
        const newUsers: SimulatedUser[] = [];

        for (let i = 0; i < count; i++) {
            const user = await this.createUser({});
            newUsers.push(user);
        }

        console.log(`[World] ✓ Created ${newUsers.length} random users`);
        return newUsers;
    }

    /**
     * Create a hidden chain ring (A -> B -> C -> ... -> A)
     * This is the "needle" that the matching algorithm must find in the "haystack"
     * 
     * @param length Number of participants in the chain (3 = triangle, 4 = square, etc.)
     * @param valueTier Value tier for items (ensures similar values for fair trade)
     */
    async seedHiddenChain(length: number, valueTier: keyof typeof VALUE_TIERS = 'mid'): Promise<ChainRing> {
        console.log(`[World] Seeding a hidden ${length}-way chain ring...`);

        if (length < 3) {
            throw new Error('Chain must have at least 3 participants');
        }

        const ringUsers: SimulatedUser[] = [];
        const ringItems: SimulatedItem[] = [];

        // Step 1: Create users for the chain
        for (let i = 0; i < length; i++) {
            const user = await this.createUser({
                name: `ChainLink_${i}_${Date.now()}`,
                email: `chain${i}_${Date.now()}@test.sim`,
            });
            ringUsers.push(user);
        }

        // Step 2: Give each user an item with CONSISTENT values (within 15% imbalance threshold)
        // Pick a single base value, then only vary by ±5% to ensure validation passes
        const baseValue = randomValue(valueTier);
        for (let i = 0; i < length; i++) {
            // Small variation to make it realistic but stay within 15% threshold
            const variation = 1 + (Math.random() * 0.1 - 0.05); // ±5%
            const itemValue = Math.round(baseValue * variation);

            const item = await this.createItem({
                ownerId: ringUsers[i].id,
                name: `Ring Item ${i} [${Date.now()}]`,
                value: itemValue,
            });
            ringItems.push(item);
        }

        // Step 3: Create the wishlist edges (ring topology)
        // User 0 wants Item 1 (owned by User 1)
        // User 1 wants Item 2 (owned by User 2)
        // ...
        // User N-1 wants Item 0 (owned by User 0) - completing the ring
        for (let i = 0; i < length; i++) {
            const wanterId = ringUsers[i].id;
            const targetItemIndex = (i + 1) % length;  // Wrap around
            const targetItemId = ringItems[targetItemIndex].id;

            await dbRun(
                `INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)`,
                [wanterId, targetItemId]
            );
        }

        console.log(`[World] ✓ Created ${length}-way chain ring:`);
        for (let i = 0; i < length; i++) {
            const wantIndex = (i + 1) % length;
            console.log(`  User ${ringUsers[i].id} (has Item ${ringItems[i].id}) → wants Item ${ringItems[wantIndex].id}`);
        }

        return { users: ringUsers, items: ringItems };
    }

    /**
     * Create a direct swap between two users (2-way trade)
     * This tests the most basic matching scenario
     */
    async seedDirectSwap(): Promise<ChainRing> {
        console.log(`[World] Seeding a direct 2-way swap...`);

        const userA = await this.createUser({ name: 'SwapperA' });
        const userB = await this.createUser({ name: 'SwapperB' });

        const itemA = await this.createItem({ ownerId: userA.id, name: 'Swap Item A' });
        const itemB = await this.createItem({ ownerId: userB.id, name: 'Swap Item B' });

        // A wants B's item, B wants A's item
        await dbRun(`INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)`, [userA.id, itemB.id]);
        await dbRun(`INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)`, [userB.id, itemA.id]);

        console.log(`[World] ✓ Created direct swap: User ${userA.id} ↔ User ${userB.id}`);

        return { users: [userA, userB], items: [itemA, itemB] };
    }

    /**
     * Create items for existing users without wishlists (deadlock prevention scenarios)
     * Users have items but no way to trade - should NOT appear in matches
     */
    async seedDeadlockCluster(count: number): Promise<{ users: SimulatedUser[]; items: SimulatedItem[] }> {
        console.log(`[World] Seeding ${count} deadlocked users (no valid trades)...`);

        const deadUsers: SimulatedUser[] = [];
        const deadItems: SimulatedItem[] = [];

        for (let i = 0; i < count; i++) {
            const user = await this.createUser({ name: `Deadlock_${i}` });
            deadUsers.push(user);

            // Give them items
            const item = await this.createItem({ ownerId: user.id });
            deadItems.push(item);
        }

        // Create NO wishlists - these users want nothing that's available
        console.log(`[World] ✓ Created ${count} deadlocked users (isolated from graph)`);

        return { users: deadUsers, items: deadItems };
    }

    /**
     * Create a user with full control over attributes
     */
    async createUser(options: {
        name?: string;
        email?: string;
        zipCode?: string;
        isPro?: boolean;
    } = {}): Promise<SimulatedUser> {
        this.userCounter++;
        const timestamp = Date.now();

        const name = options.name || randomName();
        const email = options.email || `sim${this.userCounter}_${timestamp}@test.sim`;
        const zipCode = options.zipCode || randomZipCode();
        const isPro = options.isPro ?? false;

        const userId = await createTestUser({
            name,
            email,
            password: 'simulation123',
        });

        // Update location and give a baseline rating (4.0 to pass reputation checks)
        await dbRun(`UPDATE User SET zipCode = ?, rating = 4.0 WHERE id = ?`, [zipCode, userId]);

        // Set Pro status if needed
        if (isPro) {
            await dbRun(
                `UPDATE User SET subscriptionTier = 'pro', subscriptionStatus = 'active' WHERE id = ?`,
                [userId]
            );
        }

        const user: SimulatedUser = { id: userId, name, email, zipCode, isPro };
        this.users.push(user);

        return user;
    }

    /**
     * Create an item with full control over attributes
     */
    async createItem(options: {
        ownerId: number;
        name?: string;
        description?: string;
        value?: number;
    }): Promise<SimulatedItem> {
        const name = options.name || randomItemName();
        const value = options.value ?? randomValue('mid');

        const itemId = await createTestItem({
            name,
            description: options.description || randomDescription(),
            owner_id: options.ownerId,
            estimatedMarketValue: value,
        });

        const item: SimulatedItem = { id: itemId, name, ownerId: options.ownerId, value };
        this.items.push(item);

        return item;
    }

    /**
     * Add a wishlist entry (user wants item)
     */
    async addWishlistEntry(userId: number, itemId: number): Promise<void> {
        await dbRun(`INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)`, [userId, itemId]);
    }

    /**
     * Get statistics about the current world state
     */
    getStats(): { users: number; items: number; proUsers: number } {
        return {
            users: this.users.length,
            items: this.items.length,
            proUsers: this.users.filter(u => u.isPro).length,
        };
    }
}

// Export singleton for convenience
export const world = new WorldBuilder();
