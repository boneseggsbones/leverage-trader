import request from 'supertest';
import app from './server';
import { db, init } from './database';

beforeAll(async () => {
    await init();
});

afterAll((done) => {
    db.close(done);
});

describe('Trust & Safety: Ratings', () => {
    let tradeId: string;

    beforeAll(async () => {
        // Create and accept a trade for testing ratings
        const proposeRes = await request(app)
            .post('/api/trades')
            .send({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [],
                receiverItemIds: [],
                proposerCash: 100
            });
        tradeId = proposeRes.body.trade.id;

        // Accept the trade
        await request(app)
            .post(`/api/trades/${tradeId}/respond`)
            .send({ response: 'accept' });

        // Set trade to COMPLETED_AWAITING_RATING status so rating tests can proceed
        // (In real flow, this happens after escrow/verification steps)
        await new Promise<void>((resolve, reject) => {
            db.run(
                `UPDATE trades SET status = 'COMPLETED_AWAITING_RATING' WHERE id = ?`,
                [tradeId],
                (err) => err ? reject(err) : resolve()
            );
        });
    });

    describe('POST /api/trades/:id/rate', () => {
        it('should allow proposer to rate the trade', async () => {
            const res = await request(app)
                .post(`/api/trades/${tradeId}/rate`)
                .send({
                    raterId: 1,
                    overallScore: 5,
                    itemAccuracyScore: 4,
                    communicationScore: 5,
                    shippingSpeedScore: 4,
                    publicComment: 'Great trade!'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('ratingId');
            expect(res.body.bothRated).toBeFalsy();
            expect(res.body.tradeStatus).toBe('COMPLETED_AWAITING_RATING');
        });

        it('should not allow duplicate ratings', async () => {
            const res = await request(app)
                .post(`/api/trades/${tradeId}/rate`)
                .send({
                    raterId: 1,
                    overallScore: 5
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('already rated');
        });

        it('should complete trade when both parties rate', async () => {
            const res = await request(app)
                .post(`/api/trades/${tradeId}/rate`)
                .send({
                    raterId: 2,
                    overallScore: 4,
                    itemAccuracyScore: 5,
                    communicationScore: 4,
                    shippingSpeedScore: 5,
                    publicComment: 'Smooth transaction'
                });

            expect(res.status).toBe(200);
            expect(res.body.bothRated).toBeTruthy();
            expect(res.body.tradeStatus).toBe('COMPLETED');
        });

        it('should reject invalid overall score', async () => {
            // Create another trade for this test
            const proposeRes = await request(app)
                .post('/api/trades')
                .send({
                    proposerId: 1,
                    receiverId: 2,
                    proposerItemIds: [],
                    receiverItemIds: [],
                    proposerCash: 50
                });
            const newTradeId = proposeRes.body.trade.id;
            await request(app)
                .post(`/api/trades/${newTradeId}/respond`)
                .send({ response: 'accept' });

            const res = await request(app)
                .post(`/api/trades/${newTradeId}/rate`)
                .send({
                    raterId: 1,
                    overallScore: 6 // Invalid - outside 1-5 range
                });

            expect(res.status).toBe(400);
        });
    });

    describe('GET /api/users/:id/ratings', () => {
        it('should return user ratings and stats', async () => {
            // Wait a bit for async rating updates
            await new Promise(resolve => setTimeout(resolve, 100));

            const res = await request(app).get('/api/users/2/ratings');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('ratings');
            expect(res.body).toHaveProperty('stats');
            expect(Array.isArray(res.body.ratings)).toBe(true);
        });

        it('should return 400 for invalid user ID', async () => {
            const res = await request(app).get('/api/users/invalid/ratings');
            expect(res.status).toBe(400);
        });
    });
});

describe('Trust & Safety: Disputes', () => {
    let tradeId: string;
    let disputeId: string;

    beforeAll(async () => {
        // Create a trade for dispute testing
        const proposeRes = await request(app)
            .post('/api/trades')
            .send({
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [],
                receiverItemIds: [],
                proposerCash: 200
            });
        tradeId = proposeRes.body.trade.id;

        // Accept the trade
        await request(app)
            .post(`/api/trades/${tradeId}/respond`)
            .send({ response: 'accept' });
    });

    describe('POST /api/trades/:id/open-dispute', () => {
        it('should open a dispute for the trade', async () => {
            const res = await request(app)
                .post(`/api/trades/${tradeId}/open-dispute`)
                .send({
                    initiatorId: 1,
                    disputeType: 'SNAD',
                    statement: 'Item was not as described in the listing.'
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('disputeId');
            expect(res.body.status).toBe('DISPUTE_OPENED');
            disputeId = res.body.disputeId;
        });

        it('should reject dispute from non-participant', async () => {
            // Create another trade
            const proposeRes = await request(app)
                .post('/api/trades')
                .send({
                    proposerId: 1,
                    receiverId: 2,
                    proposerItemIds: [],
                    receiverItemIds: [],
                    proposerCash: 25
                });
            const newTradeId = proposeRes.body.trade.id;

            const res = await request(app)
                .post(`/api/trades/${newTradeId}/open-dispute`)
                .send({
                    initiatorId: 999, // Non-existent user
                    disputeType: 'INR',
                    statement: 'Did not receive item'
                });

            expect(res.status).toBe(403);
        });
    });

    describe('GET /api/disputes/:id', () => {
        it('should return dispute details', async () => {
            const res = await request(app).get(`/api/disputes/${disputeId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id', disputeId);
            expect(res.body).toHaveProperty('dispute_type', 'SNAD');
            expect(res.body).toHaveProperty('status', 'OPEN_AWAITING_RESPONSE');
        });

        it('should return 404 for non-existent dispute', async () => {
            const res = await request(app).get('/api/disputes/nonexistent');
            expect(res.status).toBe(404);
        });
    });

    describe('POST /api/disputes/:id/respond', () => {
        it('should allow respondent to respond', async () => {
            const res = await request(app)
                .post(`/api/disputes/${disputeId}/respond`)
                .send({
                    respondentId: 2,
                    statement: 'The item was exactly as described. I have photos to prove it.'
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('IN_MEDIATION');
        });

        it('should not allow non-respondent to respond', async () => {
            const res = await request(app)
                .post(`/api/disputes/${disputeId}/respond`)
                .send({
                    respondentId: 1,
                    statement: 'I should not be able to respond'
                });

            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/disputes/:id/resolve', () => {
        it('should resolve the dispute', async () => {
            const res = await request(app)
                .post(`/api/disputes/${disputeId}/resolve`)
                .send({
                    resolution: 'MUTUALLY_RESOLVED',
                    resolverNotes: 'Parties reached agreement'
                });

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('RESOLVED');
            expect(res.body.resolution).toBe('MUTUALLY_RESOLVED');
        });

        it('should not allow resolving already resolved dispute', async () => {
            const res = await request(app)
                .post(`/api/disputes/${disputeId}/resolve`)
                .send({
                    resolution: 'TRADE_UPHELD'
                });

            expect(res.status).toBe(400);
        });

        it('should reject invalid resolution type', async () => {
            // Create a new dispute for this test
            const proposeRes = await request(app)
                .post('/api/trades')
                .send({ proposerId: 1, receiverId: 2, proposerItemIds: [], receiverItemIds: [], proposerCash: 10 });
            const newTradeId = proposeRes.body.trade.id;
            await request(app).post(`/api/trades/${newTradeId}/respond`).send({ response: 'accept' });

            const disputeRes = await request(app)
                .post(`/api/trades/${newTradeId}/open-dispute`)
                .send({ initiatorId: 1, disputeType: 'INR', statement: 'Test' });
            const newDisputeId = disputeRes.body.disputeId;

            const res = await request(app)
                .post(`/api/disputes/${newDisputeId}/resolve`)
                .send({
                    resolution: 'INVALID_TYPE'
                });

            expect(res.status).toBe(400);
        });
    });
});
