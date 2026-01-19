/**
 * Test Utilities for Backend API Tests
 * Provides helper functions and fixtures for testing
 */

import { db, init } from './database';
import bcrypt from 'bcryptjs';

// Test user fixtures
export const testUsers = {
    alice: { id: 1, name: 'Alice', email: 'alice@example.com', password: 'password123' },
    bob: { id: 2, name: 'Bob', email: 'bob@example.com', password: 'password456' },
};

// Test item fixtures
export const testItems = {
    laptop: { id: 1, name: 'Laptop', description: 'A powerful laptop', owner_id: 1, estimatedMarketValue: 150000 },
    mouse: { id: 2, name: 'Mouse', description: 'A wireless mouse', owner_id: 1, estimatedMarketValue: 2000 },
    keyboard: { id: 3, name: 'Keyboard', description: 'A mechanical keyboard', owner_id: 2, estimatedMarketValue: 12000 },
    monitor: { id: 4, name: 'Monitor', description: 'A 27-inch monitor', owner_id: 2, estimatedMarketValue: 25000 },
};

/**
 * Helper to run a database query and return a promise
 */
export const dbRun = (sql: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

/**
 * Helper to get a single row from database
 */
export const dbGet = (sql: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

/**
 * Helper to get multiple rows from database
 */
export const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

/**
 * Create a test user directly in the database
 */
export const createTestUser = async (data: { name: string; email: string; password: string }): Promise<number> => {
    const hashedPassword = bcrypt.hashSync(data.password, 10);
    const result = await dbRun(
        'INSERT INTO User (name, email, password, rating, avatarUrl, balance) VALUES (?, ?, ?, 0, null, 10000)',
        [data.name, data.email, hashedPassword]
    );
    return result.lastID;
};

/**
 * Create a test item directly in the database
 */
export const createTestItem = async (data: {
    name: string;
    description: string;
    owner_id: number;
    estimatedMarketValue?: number;
}): Promise<number> => {
    const result = await dbRun(
        'INSERT INTO Item (name, description, owner_id, estimatedMarketValue) VALUES (?, ?, ?, ?)',
        [data.name, data.description, data.owner_id, data.estimatedMarketValue || 10000]
    );
    return result.lastID;
};

/**
 * Create a test trade directly in the database
 */
export const createTestTrade = async (data: {
    proposerId: number;
    receiverId: number;
    proposerItemIds: number[];
    receiverItemIds: number[];
    proposerCash?: number;
    receiverCash?: number;
    status?: string;
}): Promise<string> => {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await dbRun(
        `INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, 
     proposerCash, receiverCash, status, createdAt, updatedAt, 
     proposerSubmittedTracking, receiverSubmittedTracking, 
     proposerVerifiedSatisfaction, receiverVerifiedSatisfaction,
     proposerRated, receiverRated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)`,
        [
            tradeId,
            data.proposerId.toString(),
            data.receiverId.toString(),
            JSON.stringify(data.proposerItemIds.map(String)),
            JSON.stringify(data.receiverItemIds.map(String)),
            data.proposerCash || 0,
            data.receiverCash || 0,
            data.status || 'PROPOSED',
            now,
            now
        ]
    );

    return tradeId;
};

/**
 * Create a test notification
 */
export const createTestNotification = async (data: {
    userId: number;
    type: string;
    tradeId?: string;
    title: string;
    message: string;
}): Promise<string> => {
    const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await dbRun(
        `INSERT INTO notifications (id, user_id, type, trade_id, title, message, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
        [notifId, data.userId.toString(), data.type, data.tradeId || null, data.title, data.message]
    );

    return notifId;
};

/**
 * Create a test escrow hold
 */
export const createTestEscrowHold = async (data: {
    tradeId: string;
    payerId: number;
    recipientId: number;
    amount: number;
    status?: string;
}): Promise<string> => {
    const holdId = `hold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await dbRun(
        `INSERT INTO escrow_holds (id, trade_id, payer_id, recipient_id, amount, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'mock', datetime('now'), datetime('now'))`,
        [holdId, data.tradeId, data.payerId, data.recipientId, data.amount, data.status || 'PENDING']
    );

    return holdId;
};

/**
 * Clean up test data - call after tests
 */
export const cleanupTestData = async (): Promise<void> => {
    // Delete test data created during tests (preserving seed data)
    await dbRun("DELETE FROM trades WHERE id LIKE 'trade_%'");
    await dbRun("DELETE FROM notifications WHERE id LIKE 'notif_%'");
    await dbRun("DELETE FROM escrow_holds WHERE id LIKE 'hold_%'");
    await dbRun("DELETE FROM disputes WHERE id LIKE 'dispute_%'");
    await dbRun("DELETE FROM trade_ratings WHERE trade_id LIKE 'trade_%'");
};

/**
 * Wait for async operations
 */
export const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
