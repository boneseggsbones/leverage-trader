// Fix: Implemented the full test suite for the mock API and valuation service.
import {
    resetDb,
    fetchAllUsers,
    fetchUser,
    proposeTrade,
    respondToTrade,
    _internal,
    fetchTradesForUser,
} from '../api/mockApi';
import { TradeStatus } from '../types';
import {
    valuationRouterService,
    emvCalculatorService,
    ItemValuationInput,
} from '../services/valuationService';

// A simple assertion helper for tests
const assert = (condition: boolean, message: string) => {
    if (!condition) {
        throw new Error(`Assertion Failed: ${message}`);
    }
};

export interface Test {
    name: string;
    run: () => Promise<void>;
}

export const testSuite: Test[] = [
    {
        name: 'Mock API: DB initializes with correct number of users and items',
        async run() {
            resetDb();
            const users = await fetchAllUsers();
            assert(users.length === 4, `Expected 4 users, but got ${users.length}`);
            const items = _internal.items;
            assert(items.size === 6, `Expected 6 items, but got ${items.size}`);
        }
    },
    {
        name: 'Mock API: fetchUser returns the correct user',
        async run() {
            resetDb();
            const user = await fetchUser('user-1');
            assert(!!user, 'User-1 should exist');
            assert(user!.name === 'Alice', `Expected user name "Alice", got "${user!.name}"`);
            assert(user!.inventory.length === 2, `Alice should have 2 items, got ${user!.inventory.length}`);
        }
    },
    {
        name: 'Mock API: proposeTrade creates a new pending trade',
        async run() {
            resetDb();
            const proposerId = 'user-1';
            const receiverId = 'user-2';
            const proposerItemIds = ['item-1'];
            const receiverItemIds = ['item-3'];
            const proposerCash = 1000; // $10.00

            await proposeTrade(proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash);

            const trades = await fetchTradesForUser('user-1');
            const newTrade = trades.find(t => t.status === TradeStatus.PENDING_ACCEPTANCE && t.proposerId === proposerId && t.receiverId === receiverId);

            assert(!!newTrade, 'Newly proposed trade was not found for user-1');
            assert(newTrade!.proposerCash === proposerCash, 'Trade cash amount is incorrect');
            assert(newTrade!.proposerItemIds[0] === 'item-1', 'Trade proposer item is incorrect');
        }
    },
    {
        name: 'Mock API: proposeTrade throws error for insufficient funds',
        async run() {
            resetDb();
            const proposerId = 'user-2'; // Bob has $50.00 (5000 cents)
            const receiverId = 'user-1';
            const proposerCash = 6000; // $60.00, more than he has

            try {
                await proposeTrade(proposerId, receiverId, [], [], proposerCash);
                // If it reaches here, the test fails
                throw new Error('proposeTrade should have thrown an error but did not.');
            } catch (e: any) {
                assert(e.message === 'Insufficient funds', `Expected error "Insufficient funds", but got "${e.message}"`);
            }
        }
    },
    {
        name: 'Mock API: Accepting a trade correctly swaps items and updates reputation',
        async run() {
            resetDb();
            // trade-2: user-2 (Bob) proposes item-4 (iPhone, 40k) for user-1's (Alice) item-1 (Mario 64, 7.5k).
            const tradeId = 'trade-2';

            // Alice (user-1) accepts
            await respondToTrade(tradeId, 'accept');

            const alice = await fetchUser('user-1');
            const bob = await fetchUser('user-2');

            // Verify item swap
            const aliceHasItem4 = alice!.inventory.some(i => i.id === 'item-4');
            const aliceLostItem1 = !alice!.inventory.some(i => i.id === 'item-1');
            assert(aliceHasItem4, 'Alice should have received item-4');
            assert(aliceLostItem1, 'Alice should have lost item-1');

            const bobHasItem1 = bob!.inventory.some(i => i.id === 'item-1');
            const bobLostItem4 = !bob!.inventory.some(i => i.id === 'item-4');
            assert(bobHasItem1, 'Bob should have received item-1');
            assert(bobLostItem4, 'Bob should have lost item-4');

            // Verify balance is unchanged (no cash in this trade)
            assert(alice!.balance === 20000, `Alice's balance should be unchanged at 20000, but is ${alice!.balance}`);
            assert(bob!.balance === 5000, `Bob's balance should be unchanged at 5000, but is ${bob!.balance}`);

            // Verify reputation update for an unbalanced trade
            assert(alice!.valuationReputationScore === 106, `Alice's rep should be 106, but is ${alice!.valuationReputationScore}`);
            assert(bob!.valuationReputationScore === 88, `Bob's rep should be 88, but is ${bob!.valuationReputationScore}`);
        }
    },
    {
        name: 'Mock API: Rejecting a trade updates its status to REJECTED',
        async run() {
            resetDb();
            const tradeId = 'trade-2';
            const originalAlice = await fetchUser('user-1');

            const updatedTrade = await respondToTrade(tradeId, 'reject');

            assert(updatedTrade.status === TradeStatus.REJECTED, `Trade status should be REJECTED, but is ${updatedTrade.status}`);

            // Ensure no data was changed for users
            const aliceAfterReject = await fetchUser('user-1');
            assert(JSON.stringify(originalAlice) === JSON.stringify(aliceAfterReject), 'User data should not change on trade rejection');
        }
    },
    {
        name: 'Valuation Service: Correctly calculates EMV for a known video game',
        async run() {
            const input: ItemValuationInput = {
                title: 'Super Mario 64',
                category: 'VIDEO_GAMES',
                condition: 'CIB',
                identifiers: {}
            };
            const results = await valuationRouterService.routeValuationRequest(input);
            assert(results.length === 1, `Expected 1 valuation result, got ${results.length}`);
            assert(results[0].apiName === 'PriceChartingProvider', `Expected PriceChartingProvider, got ${results[0].apiName}`);

            const finalValuation = emvCalculatorService.calculateFinalEMV(input.condition, results[0]);

            assert(finalValuation.status === 'API_VERIFIED', `Status should be API_VERIFIED, got ${finalValuation.status}`);
            assert(finalValuation.finalEMV === 7500, `Final EMV should be 7500 cents, got ${finalValuation.finalEMV}`);
            assert(finalValuation.apiMetadata.apiConditionUsed === 'cib-price', `API condition used should be 'cib-price', got ${finalValuation.apiMetadata.apiConditionUsed}`);
        }
    }
];
