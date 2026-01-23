/**
 * Fee Service Tests
 * Tests the Trust & Power monetization logic
 */

import { calculateTradeFee, FEE_CONSTANTS } from './feeService';
import { db } from './database';

// Mock user data helper
const mockUserQuery = (userData: any) => {
    // Use type assertion to handle SQLite's overloaded get method
    (db.get as jest.Mock) = jest.fn((_query: string, _params: any[], callback: (err: Error | null, row?: any) => void) => {
        callback(null, userData);
    });
};

describe('Fee Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('calculateTradeFee', () => {
        it('should return $15 fee for FREE user', async () => {
            mockUserQuery({
                id: 1,
                subscription_tier: 'FREE',
                subscription_status: 'none',
                trades_this_cycle: 0,
                cycle_started_at: null
            });

            const result = await calculateTradeFee(1);

            expect(result.feeCents).toBe(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS);
            expect(result.isWaived).toBe(false);
            expect(result.reason).toBe('Standard escrow fee');
        });

        it('should waive fee for PRO user with active subscription (trade 1 of 3)', async () => {
            mockUserQuery({
                id: 2,
                subscription_tier: 'PRO',
                subscription_status: 'active',
                trades_this_cycle: 0,
                cycle_started_at: new Date().toISOString()
            });

            const result = await calculateTradeFee(2);

            expect(result.feeCents).toBe(0);
            expect(result.isWaived).toBe(true);
            expect(result.reason).toBe('Pro membership waiver');
            expect(result.remainingFreeTrades).toBe(2); // After this trade, 2 remaining
        });

        it('should waive fee for PRO user on their 3rd trade', async () => {
            mockUserQuery({
                id: 3,
                subscription_tier: 'PRO',
                subscription_status: 'active',
                trades_this_cycle: 2, // Third trade
                cycle_started_at: new Date().toISOString()
            });

            const result = await calculateTradeFee(3);

            expect(result.feeCents).toBe(0);
            expect(result.isWaived).toBe(true);
            expect(result.remainingFreeTrades).toBe(0); // Last free trade
        });

        it('should charge $15 for PRO user who exceeded free trade limit', async () => {
            mockUserQuery({
                id: 4,
                subscription_tier: 'PRO',
                subscription_status: 'active',
                trades_this_cycle: 3, // Exceeded limit
                cycle_started_at: new Date().toISOString()
            });

            const result = await calculateTradeFee(4);

            expect(result.feeCents).toBe(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS);
            expect(result.isWaived).toBe(false);
            expect(result.reason).toBe('Monthly free trades exceeded (3/3 used)');
        });

        it('should charge $15 for PRO user with past_due subscription', async () => {
            mockUserQuery({
                id: 5,
                subscription_tier: 'PRO',
                subscription_status: 'past_due',
                trades_this_cycle: 0,
                cycle_started_at: new Date().toISOString()
            });

            const result = await calculateTradeFee(5);

            expect(result.feeCents).toBe(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS);
            expect(result.isWaived).toBe(false);
            expect(result.reason).toBe('Subscription not active');
        });

        it('should charge $15 for PRO user with canceled subscription', async () => {
            mockUserQuery({
                id: 6,
                subscription_tier: 'PRO',
                subscription_status: 'canceled',
                trades_this_cycle: 1,
                cycle_started_at: new Date().toISOString()
            });

            const result = await calculateTradeFee(6);

            expect(result.feeCents).toBe(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS);
            expect(result.isWaived).toBe(false);
            expect(result.reason).toBe('Subscription not active');
        });

        it('should return $15 fee when user not found', async () => {
            mockUserQuery(null);

            const result = await calculateTradeFee(999);

            expect(result.feeCents).toBe(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS);
            expect(result.isWaived).toBe(false);
            expect(result.reason).toContain('not found');
        });
    });

    describe('FEE_CONSTANTS', () => {
        it('should have correct values', () => {
            expect(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS).toBe(1500); // $15.00
            expect(FEE_CONSTANTS.PRO_MONTHLY_PRICE_CENTS).toBe(1200); // $12.00
            expect(FEE_CONSTANTS.PRO_FREE_TRADES_LIMIT).toBe(3);
        });
    });
});
