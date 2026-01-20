import request from 'supertest';
import app from './server';
import { db, init } from './database';

let adminUserId: number;
let regularUserId: number;

beforeAll(async () => {
    await init();

    // Create an admin user
    await new Promise<void>((resolve, reject) => {
        db.run(
            'INSERT INTO User (name, email, password, rating, isAdmin) VALUES (?, ?, ?, ?, ?)',
            ['Admin User', 'admin@test.com', 'hashedpass', 5, 1],
            function (this: any, err: Error | null) {
                if (err) return reject(err);
                adminUserId = this.lastID;
                resolve();
            }
        );
    });

    // Create a regular (non-admin) user
    await new Promise<void>((resolve, reject) => {
        db.run(
            'INSERT INTO User (name, email, password, rating, isAdmin) VALUES (?, ?, ?, ?, ?)',
            ['Regular User', 'regular@test.com', 'hashedpass', 4, 0],
            function (this: any, err: Error | null) {
                if (err) return reject(err);
                regularUserId = this.lastID;
                resolve();
            }
        );
    });

    // Create some test trades
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
        db.run(
            `INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, 
        proposerCash, receiverCash, status, createdAt, updatedAt,
        proposerSubmittedTracking, receiverSubmittedTracking, 
        proposerVerifiedSatisfaction, receiverVerifiedSatisfaction,
        proposerRated, receiverRated) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['trade-test-1', adminUserId, regularUserId, '[]', '[]', 1000, 0, 'PENDING_ACCEPTANCE', now, now, 0, 0, 0, 0, 0, 0],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });

    await new Promise<void>((resolve, reject) => {
        db.run(
            `INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, 
        proposerCash, receiverCash, status, createdAt, updatedAt,
        proposerSubmittedTracking, receiverSubmittedTracking, 
        proposerVerifiedSatisfaction, receiverVerifiedSatisfaction,
        proposerRated, receiverRated) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['trade-test-2', regularUserId, adminUserId, '[]', '[]', 500, 0, 'COMPLETED', now, now, 0, 0, 0, 0, 0, 0],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
});

afterAll((done) => {
    // Clean up test data
    db.run('DELETE FROM trades WHERE id LIKE ?', ['trade-test-%'], () => {
        db.run('DELETE FROM User WHERE email LIKE ?', ['%@test.com'], () => {
            db.close(done);
        });
    });
});

describe('Admin API', () => {
    describe('GET /api/admin/stats', () => {
        it('should return platform statistics for admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/stats?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalUsers');
            expect(res.body).toHaveProperty('totalItems');
            expect(res.body).toHaveProperty('totalTrades');
            expect(res.body).toHaveProperty('tradesByStatus');
            expect(res.body).toHaveProperty('totalDisputes');
            expect(res.body).toHaveProperty('openDisputes');
            expect(res.body).toHaveProperty('escrowHeldCents');
            expect(res.body).toHaveProperty('totalTradeValueCents');
            expect(res.body.totalUsers).toBeGreaterThanOrEqual(2);
            expect(res.body.totalTrades).toBeGreaterThanOrEqual(2);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/stats?userId=${regularUserId}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('Admin access required');
        });

        it('should return 401 when userId is not provided', async () => {
            const res = await request(app)
                .get('/api/admin/stats');

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Authentication required');
        });
    });

    describe('GET /api/admin/trades', () => {
        it('should return all trades for admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/trades?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('trades');
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('limit');
            expect(res.body).toHaveProperty('offset');
            expect(Array.isArray(res.body.trades)).toBe(true);
            expect(res.body.trades.length).toBeGreaterThanOrEqual(2);
            // Check that trades have user names populated
            expect(res.body.trades[0]).toHaveProperty('proposerName');
            expect(res.body.trades[0]).toHaveProperty('receiverName');
        });

        it('should filter trades by status', async () => {
            const res = await request(app)
                .get(`/api/admin/trades?userId=${adminUserId}&status=PENDING_ACCEPTANCE`);

            expect(res.status).toBe(200);
            expect(res.body.trades.every((t: any) => t.status === 'PENDING_ACCEPTANCE')).toBe(true);
        });

        it('should support pagination', async () => {
            const res = await request(app)
                .get(`/api/admin/trades?userId=${adminUserId}&limit=1&offset=0`);

            expect(res.status).toBe(200);
            expect(res.body.trades.length).toBe(1);
            expect(res.body.limit).toBe(1);
            expect(res.body.offset).toBe(0);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/trades?userId=${regularUserId}`);

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/admin/disputes', () => {
        it('should return all disputes for admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/disputes?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('disputes');
            expect(Array.isArray(res.body.disputes)).toBe(true);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/disputes?userId=${regularUserId}`);

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/admin/users', () => {
        it('should return all users with stats for admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/users?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('users');
            expect(Array.isArray(res.body.users)).toBe(true);
            expect(res.body.users.length).toBeGreaterThanOrEqual(2);
            // Check that users have computed stats
            expect(res.body.users[0]).toHaveProperty('tradeCount');
            expect(res.body.users[0]).toHaveProperty('itemCount');
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/users?userId=${regularUserId}`);

            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/admin/users/:id/toggle-admin', () => {
        it('should toggle admin status for a user', async () => {
            const res = await request(app)
                .post(`/api/admin/users/${regularUserId}/toggle-admin?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.user.isAdmin).toBe(1);
            expect(res.body.message).toContain('now an admin');

            // Toggle back
            const res2 = await request(app)
                .post(`/api/admin/users/${regularUserId}/toggle-admin?userId=${adminUserId}`);
            expect(res2.body.user.isAdmin).toBe(0);
        });

        it('should return 404 for non-existent user', async () => {
            const res = await request(app)
                .post(`/api/admin/users/99999/toggle-admin?userId=${adminUserId}`);

            expect(res.status).toBe(404);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .post(`/api/admin/users/1/toggle-admin?userId=${regularUserId}`);

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/admin/analytics', () => {
        it('should return trade analytics data', async () => {
            const res = await request(app)
                .get(`/api/admin/analytics?userId=${adminUserId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('tradesByDay');
            expect(res.body).toHaveProperty('disputesByDay');
            expect(res.body).toHaveProperty('usersByDay');
            expect(res.body).toHaveProperty('periodDays');
            expect(Array.isArray(res.body.tradesByDay)).toBe(true);
        });

        it('should support custom days parameter', async () => {
            const res = await request(app)
                .get(`/api/admin/analytics?userId=${adminUserId}&days=7`);

            expect(res.status).toBe(200);
            expect(res.body.periodDays).toBe(7);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get(`/api/admin/analytics?userId=${regularUserId}`);

            expect(res.status).toBe(403);
        });
    });
});
