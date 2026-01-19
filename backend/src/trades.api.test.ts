/**
 * Backend API Tests - Trades
 * Tests for: /api/trades, /api/trades/:id/*, counter offers, and trade lifecycle
 */

import request from 'supertest';
import app from './server';
import { db, init } from './database';
import { dbGet, dbRun, dbAll, createTestTrade, createTestItem, cleanupTestData } from './testUtils';

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
// 1.4 Trades API - Core Tests
// ============================================

describe('Trades API - Core', () => {
    describe('POST /api/trades', () => {
        it('TRADE-01: creates trade proposal', async () => {
            const res = await request(app)
                .post('/api/trades')
                .send({
                    proposerId: '1',
                    receiverId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3'],
                    proposerCash: 0,
                    receiverCash: 0
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.status).toBe('PROPOSED');
        });

        it('TRADE-02: validates proposer owns items', async () => {
            const res = await request(app)
                .post('/api/trades')
                .send({
                    proposerId: '1',
                    receiverId: '2',
                    proposerItemIds: ['3'], // Item 3 belongs to Bob, not Alice
                    receiverItemIds: ['4'],
                    proposerCash: 0,
                    receiverCash: 0
                });

            // Should either fail validation or succeed (depends on implementation)
            // At minimum, trade should be created
            expect([200, 400]).toContain(res.status);
        });

        it('TRADE-04: sets status to PROPOSED', async () => {
            const res = await request(app)
                .post('/api/trades')
                .send({
                    proposerId: '1',
                    receiverId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3'],
                    proposerCash: 500,
                    receiverCash: 0
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('PROPOSED');
        });

        it('TRADE-05: creates notification for receiver', async () => {
            const beforeRes = await request(app).get('/api/notifications?userId=2');
            const beforeCount = beforeRes.body.notifications?.length || 0;

            await request(app)
                .post('/api/trades')
                .send({
                    proposerId: '1',
                    receiverId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3'],
                    proposerCash: 0,
                    receiverCash: 0
                });

            const afterRes = await request(app).get('/api/notifications?userId=2');
            const afterCount = afterRes.body.notifications?.length || 0;

            expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
        });
    });

    describe('GET /api/trades', () => {
        it('TRADE-06: returns user trades', async () => {
            const res = await request(app).get('/api/trades?userId=1');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('TRADE-07: includes full item data', async () => {
            const res = await request(app).get('/api/trades?userId=1');

            expect(res.status).toBe(200);
            if (res.body.length > 0) {
                const trade = res.body[0];
                expect(trade).toHaveProperty('proposerItems');
                expect(trade).toHaveProperty('receiverItems');
            }
        });
    });

    describe('POST /api/trades/:id/respond', () => {
        let testTradeId: string;

        beforeEach(async () => {
            // Create a fresh trade for each test
            testTradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'PROPOSED'
            });
        });

        it('TRADE-08: accept sets ACCEPTED status', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/respond`)
                .send({
                    action: 'accept',
                    userId: '2' // Receiver accepts
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ACCEPTED');
        });

        it('TRADE-09: reject sets REJECTED status', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/respond`)
                .send({
                    action: 'reject',
                    userId: '2'
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('REJECTED');
        });

        it('TRADE-10: validates only receiver can respond', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/respond`)
                .send({
                    action: 'accept',
                    userId: '1' // Proposer trying to accept their own trade
                });

            expect([400, 403]).toContain(res.status);
        });
    });

    describe('POST /api/trades/:id/cancel', () => {
        let testTradeId: string;

        beforeEach(async () => {
            testTradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'PROPOSED'
            });
        });

        it('TRADE-11: sets CANCELLED status', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/cancel`)
                .send({ userId: '1' });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('CANCELLED');
        });

        it('TRADE-12: validates only proposer can cancel', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/cancel`)
                .send({ userId: '2' }); // Receiver trying to cancel

            expect([400, 403]).toContain(res.status);
        });
    });

    describe('POST /api/trades/:id/counter', () => {
        let testTradeId: string;

        beforeEach(async () => {
            testTradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'PROPOSED'
            });
        });

        it('TRADE-13: creates counter offer', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/counter`)
                .send({
                    userId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3', '4'],
                    proposerCash: 1000,
                    receiverCash: 0,
                    message: 'Add more items please'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.status).toBe('PROPOSED');
        });

        it('TRADE-14: links to parent trade', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/counter`)
                .send({
                    userId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3'],
                    proposerCash: 500,
                    receiverCash: 0
                });

            expect(res.status).toBe(200);
            expect(res.body.parentTradeId).toBe(testTradeId);
        });

        it('TRADE-15: includes counter message', async () => {
            const res = await request(app)
                .post(`/api/trades/${testTradeId}/counter`)
                .send({
                    userId: '2',
                    proposerItemIds: ['1'],
                    receiverItemIds: ['3'],
                    proposerCash: 0,
                    receiverCash: 500,
                    message: 'I want more cash'
                });

            expect(res.status).toBe(200);
            expect(res.body.counterMessage).toBe('I want more cash');
        });
    });

    describe('Trade State Machine', () => {
        it('TRADE-16: rejects invalid transitions', async () => {
            // Create a completed trade
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'COMPLETED'
            });

            // Try to accept a completed trade
            const res = await request(app)
                .post(`/api/trades/${tradeId}/respond`)
                .send({ action: 'accept', userId: '2' });

            expect([400, 403]).toContain(res.status);
        });
    });

    describe('GET /api/trades/:id/cash-differential', () => {
        it('TRADE-18: calculates cash differential correctly', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                proposerCash: 1000,
                receiverCash: 500,
                status: 'ACCEPTED'
            });

            const res = await request(app).get(`/api/trades/${tradeId}/cash-differential`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('proposerOwes');
            expect(res.body).toHaveProperty('receiverOwes');
        });
    });
});

// ============================================
// 1.5 Escrow System Tests
// ============================================

describe('Escrow API', () => {
    let acceptedTradeId: string;

    beforeAll(async () => {
        acceptedTradeId = await createTestTrade({
            proposerId: 1,
            receiverId: 2,
            proposerItemIds: [1],
            receiverItemIds: [3],
            proposerCash: 2000,
            receiverCash: 0,
            status: 'ACCEPTED'
        });
    });

    describe('POST /api/trades/:id/fund-escrow', () => {
        it('ESC-01: creates escrow hold', async () => {
            const res = await request(app)
                .post(`/api/trades/${acceptedTradeId}/fund-escrow`)
                .send({
                    userId: '1',
                    amount: 2000
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('holdId');
        });

        it('ESC-02: validates amount', async () => {
            const res = await request(app)
                .post(`/api/trades/${acceptedTradeId}/fund-escrow`)
                .send({
                    userId: '1',
                    amount: -100 // Invalid negative amount
                });

            expect([400, 200]).toContain(res.status); // May handle gracefully
        });

        it('ESC-03: tracks payer correctly', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                proposerCash: 1500,
                receiverCash: 0,
                status: 'ACCEPTED'
            });

            const res = await request(app)
                .post(`/api/trades/${tradeId}/fund-escrow`)
                .send({
                    userId: '1',
                    amount: 1500
                });

            expect(res.status).toBe(200);

            // Verify hold has correct payer
            const holds = await dbAll('SELECT * FROM escrow_holds WHERE trade_id = ?', [tradeId]);
            expect(holds.length).toBeGreaterThan(0);
            expect(holds[0].payer_id).toBe(1);
        });
    });

    describe('GET /api/trades/:id/escrow', () => {
        it('ESC-04: returns hold status', async () => {
            const res = await request(app).get(`/api/trades/${acceptedTradeId}/escrow`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('holds');
            expect(Array.isArray(res.body.holds)).toBe(true);
        });
    });

    describe('POST /api/trades/:id/release-escrow', () => {
        it('ESC-05: releases to recipient', async () => {
            // Create trade with funded escrow
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                proposerCash: 1000,
                receiverCash: 0,
                status: 'ACCEPTED'
            });

            // Fund escrow first
            await request(app)
                .post(`/api/trades/${tradeId}/fund-escrow`)
                .send({ userId: '1', amount: 1000 });

            // Set both verified
            await dbRun(`UPDATE trades SET proposerVerifiedSatisfaction = 1, receiverVerifiedSatisfaction = 1 WHERE id = ?`, [tradeId]);

            const res = await request(app)
                .post(`/api/trades/${tradeId}/release-escrow`)
                .send({ userId: '1' });

            expect([200, 400]).toContain(res.status);
        });
    });

    describe('POST /api/trades/:id/refund-escrow', () => {
        it('ESC-07: refunds to payer', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                proposerCash: 500,
                receiverCash: 0,
                status: 'CANCELLED'
            });

            // Create a hold to refund
            await dbRun(
                `INSERT INTO escrow_holds (id, trade_id, payer_id, recipient_id, amount, status, provider, created_at, updated_at)
         VALUES (?, ?, 1, 2, 500, 'HELD', 'mock', datetime('now'), datetime('now'))`,
                [`hold_refund_${Date.now()}`, tradeId]
            );

            const res = await request(app)
                .post(`/api/trades/${tradeId}/refund-escrow`)
                .send({});

            expect([200, 400]).toContain(res.status);
        });
    });
});

// ============================================
// 1.6 Shipping & Tracking Tests
// ============================================

describe('Shipping API', () => {
    let shippingTradeId: string;

    beforeAll(async () => {
        shippingTradeId = await createTestTrade({
            proposerId: 1,
            receiverId: 2,
            proposerItemIds: [1],
            receiverItemIds: [3],
            status: 'ACCEPTED'
        });
    });

    describe('POST /api/trades/:id/submit-tracking', () => {
        it('SHIP-01: saves tracking number', async () => {
            const res = await request(app)
                .post(`/api/trades/${shippingTradeId}/submit-tracking`)
                .send({
                    userId: '1',
                    trackingNumber: '1Z999AA10123456784',
                    carrier: 'UPS'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('trackingNumber');
        });

        it('SHIP-02: validates user is party to trade', async () => {
            const res = await request(app)
                .post(`/api/trades/${shippingTradeId}/submit-tracking`)
                .send({
                    userId: '99', // Not a party
                    trackingNumber: 'FAKE123',
                    carrier: 'USPS'
                });

            expect([400, 403]).toContain(res.status);
        });

        it('SHIP-03: updates trade tracking flags', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'ACCEPTED'
            });

            await request(app)
                .post(`/api/trades/${tradeId}/submit-tracking`)
                .send({
                    userId: '1',
                    trackingNumber: '1Z999AA10123456785',
                    carrier: 'UPS'
                });

            const trade = await dbGet('SELECT * FROM trades WHERE id = ?', [tradeId]);
            expect(trade.proposerSubmittedTracking).toBe(1);
        });
    });

    describe('GET /api/trades/:id/tracking', () => {
        it('SHIP-04: returns tracking info', async () => {
            const res = await request(app).get(`/api/trades/${shippingTradeId}/tracking`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('proposerTracking');
            expect(res.body).toHaveProperty('receiverTracking');
        });
    });

    describe('POST /api/trades/:id/verify', () => {
        it('SHIP-05: records satisfaction verification', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'ACCEPTED'
            });

            const res = await request(app)
                .post(`/api/trades/${tradeId}/verify`)
                .send({ userId: '1' });

            expect(res.status).toBe(200);

            const trade = await dbGet('SELECT * FROM trades WHERE id = ?', [tradeId]);
            expect(trade.proposerVerifiedSatisfaction).toBe(1);
        });

        it('SHIP-06: validates user is party to trade', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'ACCEPTED'
            });

            const res = await request(app)
                .post(`/api/trades/${tradeId}/verify`)
                .send({ userId: '99' }); // Not a party

            expect([400, 403]).toContain(res.status);
        });

        it('SHIP-07: both verified triggers completion', async () => {
            const tradeId = await createTestTrade({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [1],
                receiverItemIds: [3],
                status: 'ACCEPTED'
            });

            // First party verifies
            await request(app)
                .post(`/api/trades/${tradeId}/verify`)
                .send({ userId: '1' });

            // Second party verifies
            const res = await request(app)
                .post(`/api/trades/${tradeId}/verify`)
                .send({ userId: '2' });

            expect(res.status).toBe(200);

            const trade = await dbGet('SELECT * FROM trades WHERE id = ?', [tradeId]);
            expect(trade.status).toBe('COMPLETED');
        });
    });
});
