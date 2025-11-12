import request from 'supertest';
import app from './server';
import { db, init } from './database';

beforeAll(async () => {
  await init();
});

afterAll((done) => {
  db.close(done);
});

describe('Trades API', () => {
  it('should create a trade and accept it, transferring items and balances', async () => {
    // Ensure users and items from seed exist
    // Proposer: user 1, Receiver: user 2

    // Create trade
    const proposeRes = await request(app)
      .post('/api/trades')
      .send({ proposerId: 1, receiverId: 2, proposerItemIds: [1], receiverItemIds: [3], proposerCash: 1000 });

    expect(proposeRes.status).toBe(200);
    expect(proposeRes.body).toHaveProperty('trade');
    const trade = proposeRes.body.trade;
    expect(trade).toHaveProperty('id');

    // Record balances before
    const beforeProposer: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM User WHERE id = ?', [1], (err, row) => err ? reject(err) : resolve(row));
    });
    const beforeReceiver: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM User WHERE id = ?', [2], (err, row) => err ? reject(err) : resolve(row));
    });

    // Accept the trade
    const acceptRes = await request(app)
      .post(`/api/trades/${trade.id}/respond`)
      .send({ response: 'accept' });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body).toHaveProperty('status');
    expect(acceptRes.body.status).toBe('COMPLETED_AWAITING_RATING');

    // Verify items ownership swapped
    const item1: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Item WHERE id = ?', [1], (err, row) => err ? reject(err) : resolve(row));
    });
    const item3: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Item WHERE id = ?', [3], (err, row) => err ? reject(err) : resolve(row));
    });

    expect(item1.owner_id).toBe(2);
    expect(item3.owner_id).toBe(1);

    // Verify balances updated
    const afterProposer: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM User WHERE id = ?', [1], (err, row) => err ? reject(err) : resolve(row));
    });
    const afterReceiver: any = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM User WHERE id = ?', [2], (err, row) => err ? reject(err) : resolve(row));
    });

    expect(afterProposer.balance).toBe(beforeProposer.balance - 1000 + 0);
    expect(afterReceiver.balance).toBe(beforeReceiver.balance - 0 + 1000);
  });
});
