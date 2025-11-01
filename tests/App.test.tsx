// Fix: Populated file with a test suite and helper functions.
import { fetchAllUsers, fetchUser, proposeTrade, fetchTradesForUser, respondToTrade } from '../api/mockApi';
import { TradeStatus } from '../types';

export interface Test {
    name: string;
    run: () => Promise<void>;
}

// A simple assertion helper for tests
function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Assertion Failed: ${message}`);
    }
}

export const testSuite: Test[] = [
    {
        name: 'API: fetchAllUsers should return multiple users',
        async run() {
            const users = await fetchAllUsers();
            assert(users.length > 1, 'Expected more than one user to be returned.');
            assert(users.every(u => u.id && u.name), 'All users should have an ID and a name.');
        }
    },
    {
        name: 'API: fetchUser should return a specific user',
        async run() {
            const user = await fetchUser('user-1');
            assert(!!user, "User with ID 'user-1' should be found.");
            assert(user?.id === 'user-1', "Returned user ID should match the requested ID.");
            assert(user?.name === 'Alice', "User name should be Alice.");
        }
    },
    {
        name: 'API: proposeTrade should create a new pending trade',
        async run() {
            const initialTrades = await fetchTradesForUser('user-1');
            const initialPending = initialTrades.filter(t => t.status === TradeStatus.PENDING_ACCEPTANCE).length;

            await proposeTrade('user-1', 'user-2', ['item-1'], [], 1000); // Propose with $10 in cents

            const finalTrades = await fetchTradesForUser('user-1');
            const finalPending = finalTrades.filter(t => t.status === TradeStatus.PENDING_ACCEPTANCE).length;

            assert(finalPending === initialPending + 1, 'A new pending trade should have been created.');
        }
    },
    {
        name: 'API: respondToTrade should update trade status',
        async run() {
            // Create a disposable trade to avoid interfering with other tests
            const newTrade = await proposeTrade('user-3', 'user-2', [], [], 500);
            assert(newTrade.status === TradeStatus.PENDING_ACCEPTANCE, 'Trade should be pending initially.');
            
            const acceptedTrade = await respondToTrade(newTrade.id, 'accept');
            assert(acceptedTrade.status === TradeStatus.COMPLETED, 'Trade should be COMPLETED after acceptance.');

            const anotherTrade = await proposeTrade('user-3', 'user-2', [], [], 500);
            const rejectedTrade = await respondToTrade(anotherTrade.id, 'reject');
            assert(rejectedTrade.status === TradeStatus.REJECTED, 'Trade should be REJECTED after rejection.');
        }
    },
    {
        name: 'API: Test should fail gracefully',
        async run() {
            // Fix: Replaced `1 === 2` with `false` to maintain the intentional failure while avoiding a TypeScript type overlap error.
            assert(false, 'This is an intentional failure to test the UI.');
        }
    }
];