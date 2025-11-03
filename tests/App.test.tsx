// Fix: Populated file with a test suite and helper functions.
import { 
    fetchAllUsers, 
    fetchUser, 
    proposeTrade, 
    fetchTradesForUser, 
    respondToTrade,
    cancelTrade,
    openDispute,
    addDisputeEvidence,
    addDisputeResponse,
    submitRating,
    fetchRatingsForTrade
} from '../api/mockApi';
import { TradeStatus, DisputeStatus, DisputeType } from '../types';

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
            // Fix: Destructure `newTrade` from the result of `proposeTrade`.
            const { newTrade } = await proposeTrade('user-3', 'user-2', [], [], 500);
            assert(newTrade.status === TradeStatus.PENDING_ACCEPTANCE, 'Trade should be pending initially.');
            
            const acceptedTrade = await respondToTrade(newTrade.id, 'accept');
            assert(acceptedTrade.status === TradeStatus.COMPLETED_AWAITING_RATING, 'Trade should be COMPLETED_AWAITING_RATING after acceptance.');

            // Fix: Destructure `newTrade` and rename it to avoid conflict.
            const { newTrade: anotherTrade } = await proposeTrade('user-3', 'user-2', [], [], 500);
            const rejectedTrade = await respondToTrade(anotherTrade.id, 'reject');
            assert(rejectedTrade.status === TradeStatus.REJECTED, 'Trade should be REJECTED after rejection.');
        }
    },
    {
        name: 'API: cancelTrade should correctly cancel a pending trade',
        async run() {
            // Fix: Destructure `newTrade` from the result of `proposeTrade` and rename it.
            const { newTrade: trade } = await proposeTrade('user-1', 'user-2', ['item-2'], [], 0);
            assert(trade.status === TradeStatus.PENDING_ACCEPTANCE, 'Trade should be pending to be cancelled.');
            
            const cancelledTrade = await cancelTrade(trade.id, 'user-1');
            assert(cancelledTrade.status === TradeStatus.CANCELLED, 'Trade status should be updated to CANCELLED.');
        }
    },
    {
        name: 'Dispute Workflow: Should open, add evidence, and move to mediation',
        async run() {
            // Fix: Destructure `newTrade` from the result of `proposeTrade` and rename it.
            const { newTrade: trade } = await proposeTrade('user-2', 'user-3', [], [], 100);
            await respondToTrade(trade.id, 'accept');

            // Step 1: Open dispute
            const dispute = await openDispute(trade.id, 'user-2', 'SNAD', 'Item was not as described!');
            const updatedTrade = (await fetchTradesForUser('user-2')).find(t => t.id === trade.id);

            assert(!!dispute, 'Dispute ticket should be created.');
            assert(updatedTrade?.status === TradeStatus.DISPUTE_OPENED, 'Trade status should be DISPUTE_OPENED.');
            assert(dispute.status === DisputeStatus.OPEN_AWAITING_RESPONSE, 'Dispute should be awaiting response.');

            // Step 2: Add initiator evidence
            await addDisputeEvidence(dispute.id, { statement: 'Here are photos', attachments: ['photo1.jpg'] });

            // Step 3: Add respondent evidence and move to mediation
            const mediatedDispute = await addDisputeResponse(dispute.id, { statement: 'The item was perfect', attachments: [] });
            assert(mediatedDispute.status === DisputeStatus.IN_MEDIATION, 'Dispute should move to IN_MEDIATION after response.');
        }
    },
    {
        name: 'Rating System: Should keep ratings blind until both parties submit',
        async run() {
            // Fix: Destructure `newTrade` from the result of `proposeTrade` and rename it.
            const { newTrade: trade } = await proposeTrade('user-1', 'user-3', [], ['item-5'], 20000);
            await respondToTrade(trade.id, 'accept');

            // Step 1: First user rates
            await submitRating(trade.id, 'user-1', {
                overallScore: 5,
                itemAccuracyScore: 5,
                communicationScore: 5,
                shippingSpeedScore: 5,
                publicComment: 'Great trade!',
                privateFeedback: null,
            });

            let ratings = await fetchRatingsForTrade(trade.id);
            assert(ratings.length === 1, 'There should be one rating after the first submission.');
            assert(ratings[0].isRevealed === false, 'The first rating should not be revealed.');
            let updatedTrade = (await fetchTradesForUser('user-1')).find(t => t.id === trade.id);
            assert(updatedTrade?.status === TradeStatus.COMPLETED_AWAITING_RATING, 'Trade should still be awaiting rating.');

            // Step 2: Second user rates
            await submitRating(trade.id, 'user-3', {
                overallScore: 4,
                itemAccuracyScore: 5,
                communicationScore: 4,
                shippingSpeedScore: 4,
                publicComment: 'Good experience.',
                privateFeedback: null,
            });

            ratings = await fetchRatingsForTrade(trade.id);
            assert(ratings.length === 2, 'There should be two ratings after the second submission.');
            assert(ratings.every(r => r.isRevealed === true), 'Both ratings should now be revealed.');
            updatedTrade = (await fetchTradesForUser('user-1')).find(t => t.id === trade.id);
            assert(updatedTrade?.status === TradeStatus.COMPLETED, 'Trade status should be COMPLETED after both ratings.');
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
