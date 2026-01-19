/**
 * Backend API Tests - Authentication & Users
 * Tests for: /api/session, /api/login, /api/users, /api/users/:id
 */

import request from 'supertest';
import app from './server';
import { db, init } from './database';
import { dbGet, dbRun, createTestUser, cleanupTestData } from './testUtils';
import fs from 'fs';

beforeAll(async () => {
    await init();
});

afterAll((done) => {
    cleanupTestData().then(() => {
        db.close(() => {
            done();
        });
    });
});

// ============================================
// 1.1 Authentication & Session Tests
// ============================================

describe('Authentication API', () => {
    describe('GET /api/session', () => {
        it('AUTH-01: returns null user when not logged in', async () => {
            const res = await request(app).get('/api/session');
            expect(res.status).toBe(200);
            // Without a session, user should be null
            expect(res.body.user).toBeNull();
        });
    });

    describe('POST /api/login', () => {
        it('AUTH-03: returns user with valid credentials', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ email: 'alice@example.com', password: 'password123' });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.email).toBe('alice@example.com');
            expect(res.body).toHaveProperty('inventory');
        });

        it('AUTH-04: returns 401 with invalid credentials', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ email: 'alice@example.com', password: 'wrongpassword' });

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error');
        });

        it('AUTH-04b: returns 401 for non-existent user', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({ email: 'nobody@example.com', password: 'password' });

            expect(res.status).toBe(401);
        });
    });
});

// ============================================
// 1.2 Users API Tests
// ============================================

describe('Users API', () => {
    describe('GET /api/users', () => {
        it('USER-01: returns all users', async () => {
            const res = await request(app).get('/api/users');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThanOrEqual(2); // At least Alice and Bob
        });
    });

    describe('GET /api/users/:id', () => {
        it('USER-02: returns user with inventory', async () => {
            const res = await request(app).get('/api/users/1');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', 1);
            expect(res.body).toHaveProperty('name');
            expect(res.body).toHaveProperty('inventory');
            expect(Array.isArray(res.body.inventory)).toBe(true);
        });

        it('USER-03: returns 404 for non-existent user', async () => {
            const res = await request(app).get('/api/users/99999');

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /api/users', () => {
        it('USER-04: creates new user with hashed password', async () => {
            const uniqueEmail = `testuser_${Date.now()}@example.com`;
            const res = await request(app)
                .post('/api/users')
                .send({
                    email: uniqueEmail,
                    password: 'testpass123',
                    name: 'Test User'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');

            // Verify password is hashed in database
            const user = await dbGet('SELECT * FROM User WHERE id = ?', [res.body.id]);
            expect(user.password).not.toBe('testpass123');
            expect(user.password.startsWith('$2')).toBe(true); // bcrypt hash
        });

        it('USER-05: validates required fields', async () => {
            const res = await request(app)
                .post('/api/users')
                .send({ name: 'Invalid User' }); // Missing email and password

            expect(res.status).toBe(400);
        });

        it('USER-06: rejects duplicate email', async () => {
            // First create
            const uniqueEmail = `duplicate_${Date.now()}@example.com`;
            await request(app)
                .post('/api/users')
                .send({ email: uniqueEmail, password: 'pass1', name: 'First' });

            // Try duplicate
            const res = await request(app)
                .post('/api/users')
                .send({ email: uniqueEmail, password: 'pass2', name: 'Second' });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/already exists|UNIQUE/i);
        });
    });

    describe('PUT /api/users/:id', () => {
        it('USER-07: updates profile fields', async () => {
            const res = await request(app)
                .put('/api/users/1')
                .send({
                    name: 'Alice Updated',
                    aboutMe: 'I love trading!'
                });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Alice Updated');
            expect(res.body.aboutMe).toBe('I love trading!');

            // Restore original name
            await request(app).put('/api/users/1').send({ name: 'Alice' });
        });

        it('USER-08: parses location into city/state', async () => {
            const res = await request(app)
                .put('/api/users/1')
                .send({ location: 'Austin, Texas' });

            expect(res.status).toBe(200);
            expect(res.body.city).toBe('Austin');
            expect(res.body.state).toBe('Texas');
        });

        it('USER-09: returns 400 for invalid ID', async () => {
            const res = await request(app)
                .put('/api/users/notanumber')
                .send({ name: 'Invalid' });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/users/:id/ratings', () => {
        it('USER-10: returns user ratings array', async () => {
            const res = await request(app).get('/api/users/1/ratings');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('ratings');
            expect(Array.isArray(res.body.ratings)).toBe(true);
        });

        it('USER-11: includes average calculation', async () => {
            const res = await request(app).get('/api/users/1/ratings');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('averageRating');
            expect(typeof res.body.averageRating === 'number' || res.body.averageRating === null).toBe(true);
        });
    });

    describe('GET /api/dashboard', () => {
        it('USER-12: returns user summary', async () => {
            const res = await request(app).get('/api/dashboard?userId=1');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('user');
            expect(res.body).toHaveProperty('inventoryCount');
        });
    });
});

// ============================================
// 1.3 Items API Tests  
// ============================================

describe('Items API', () => {
    describe('GET /api/items', () => {
        it('ITEM-01: returns all items', async () => {
            const res = await request(app).get('/api/items');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('ITEM-02: filters by owner userId', async () => {
            const res = await request(app).get('/api/items?userId=1');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            res.body.forEach((item: any) => {
                expect(item.owner_id).toBe(1);
            });
        });
    });

    describe('POST /api/items', () => {
        it('ITEM-03: creates item with valid data', async () => {
            const res = await request(app)
                .post('/api/items')
                .field('name', 'Test Item Created')
                .field('description', 'Test Description')
                .field('owner_id', '1')
                .field('estimatedMarketValue', '5000');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');

            // Clean up
            await request(app).delete(`/api/items/${res.body.id}`);
        });

        it('ITEM-04: validates required fields', async () => {
            const res = await request(app)
                .post('/api/items')
                .field('name', 'Missing Owner');

            expect(res.status).toBe(400);
        });
    });

    describe('PUT /api/items/:id', () => {
        let testItemId: number;

        beforeAll(async () => {
            const createRes = await request(app)
                .post('/api/items')
                .field('name', 'Item to Update')
                .field('description', 'Original Description')
                .field('owner_id', '1');
            testItemId = createRes.body.id;
        });

        afterAll(async () => {
            await request(app).delete(`/api/items/${testItemId}`);
        });

        it('ITEM-05: updates item fields', async () => {
            const res = await request(app)
                .put(`/api/items/${testItemId}`)
                .field('name', 'Updated Item Name')
                .field('description', 'Updated Description');

            expect(res.status).toBe(200);
            expect(res.body.changes).toBe(1);

            const item = await dbGet('SELECT * FROM Item WHERE id = ?', [testItemId]);
            expect(item.name).toBe('Updated Item Name');
        });

        it('ITEM-06: handles image upload', async () => {
            const res = await request(app)
                .put(`/api/items/${testItemId}`)
                .attach('image', Buffer.from('test image data'), 'test.jpg');

            expect(res.status).toBe(200);

            const item = await dbGet('SELECT * FROM Item WHERE id = ?', [testItemId]);
            expect(item.imageUrl).toBeTruthy();
        });
    });

    describe('DELETE /api/items/:id', () => {
        it('ITEM-07: removes item', async () => {
            // Create item to delete
            const createRes = await request(app)
                .post('/api/items')
                .field('name', 'Item to Delete')
                .field('description', 'Will be deleted')
                .field('owner_id', '1');

            const res = await request(app).delete(`/api/items/${createRes.body.id}`);

            expect(res.status).toBe(200);
            expect(res.body.changes).toBe(1);

            const item = await dbGet('SELECT * FROM Item WHERE id = ?', [createRes.body.id]);
            expect(item).toBeUndefined();
        });
    });

    describe('Item Valuations', () => {
        it('ITEM-08: GET /api/items/:id/valuations returns valuation data', async () => {
            const res = await request(app).get('/api/items/1/valuations');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('apiValuations');
            expect(res.body).toHaveProperty('userOverrides');
        });

        it('ITEM-09: POST /api/items/:id/valuations/override creates override', async () => {
            const res = await request(app)
                .post('/api/items/1/valuations/override')
                .send({
                    userId: 1,
                    overrideValue: 10000,
                    reason: 'Test override'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
        });

        it('ITEM-10: GET /api/items/:id/similar-prices returns comparables', async () => {
            const res = await request(app).get('/api/items/1/similar-prices');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('similarItems');
            expect(Array.isArray(res.body.similarItems)).toBe(true);
        });

        it('ITEM-11: GET /api/items/:id/price-signals returns trade history', async () => {
            const res = await request(app).get('/api/items/1/price-signals');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('signals');
            expect(Array.isArray(res.body.signals)).toBe(true);
        });
    });
});
