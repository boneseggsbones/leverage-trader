// Fix: Populated file with mock data and API functions.
import { User, Item, Trade, TradeStatus, DisputeTicket, DisputeType, DisputeResolution, TradeRating, MediationMessage } from '../types';

// --- MOCK DATABASE ---

const mockItems: Record<string, Item> = {
    'item-1': { id: 'item-1', name: 'Super Mario 64', description: 'N64 classic', imageUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=Mario64', category: 'VIDEO_GAMES', condition: 'LOOSE', estimatedMarketValue: 3000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-123', baselineApiValue: 3000, apiConditionUsed: 'loose-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'cib-price': 7500, 'loose-price': 3000 } } },
    'item-2': { id: 'item-2', name: 'Ocarina of Time', description: 'N64 masterpiece', imageUrl: 'https://via.placeholder.com/150/00FF00/FFFFFF?text=Zelda', category: 'VIDEO_GAMES', condition: 'CIB', estimatedMarketValue: 12000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-456', baselineApiValue: 12000, apiConditionUsed: 'cib-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'cib-price': 12000, 'loose-price': 5000 } } },
    'item-3': { id: 'item-3', name: 'Charizard Holo', description: 'Base Set, 1st Edition', imageUrl: 'https://via.placeholder.com/150/FFA500/FFFFFF?text=Charizard', category: 'TCG', condition: 'GRADED', estimatedMarketValue: 50000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'JustTCGProvider', apiItemId: 'tcg-char-1', baselineApiValue: 50000, apiConditionUsed: 'near-mint-price', confidenceScore: 90, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'near-mint-price': 50000 } } },
    'item-4': { id: 'item-4', name: 'Playstation 5', description: 'Disc Edition', imageUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=PS5', category: 'VIDEO_GAMES', condition: 'NEW_SEALED', estimatedMarketValue: 45000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-789', baselineApiValue: 45000, apiConditionUsed: 'new-price', confidenceScore: 98, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'new-price': 45000 } } },
    'item-5': { id: 'item-5', name: 'Air Jordan 1', description: 'Chicago, 1985', imageUrl: 'https://via.placeholder.com/150/800080/FFFFFF?text=Jordan1', category: 'SNEAKERS', condition: 'OTHER', estimatedMarketValue: 200000, valuationSource: 'USER_DEFINED_ESTIMATE', apiMetadata: { apiName: 'KicksDBProvider', apiItemId: null, baselineApiValue: null, apiConditionUsed: null, confidenceScore: 70, lastApiSyncTimestamp: new Date(), rawDataSnapshot: null } },
    'item-6': { id: 'item-6', name: 'Black Lotus', description: 'Alpha Edition', imageUrl: 'https://via.placeholder.com/150/000000/FFFFFF?text=Lotus', category: 'TCG', condition: 'GRADED', estimatedMarketValue: 1000000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'JustTCGProvider', apiItemId: 'tcg-lotus-1', baselineApiValue: 1000000, apiConditionUsed: 'near-mint-price', confidenceScore: 92, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'near-mint-price': 1000000 } } },
};

const mockUsers: Record<string, User> = {
    'user-1': { id: 'user-1', name: 'Alice', avatarUrl: 'https://i.pravatar.cc/150?u=user-1', cash: 50000, inventory: [mockItems['item-1'], mockItems['item-3']], valuationReputationScore: 95, netTradeSurplus: 12000 },
    'user-2': { id: 'user-2', name: 'Bob', avatarUrl: 'https://i.pravatar.cc/150?u=user-2', cash: 25000, inventory: [mockItems['item-2'], mockItems['item-4']], valuationReputationScore: 88, netTradeSurplus: -5000 },
    'user-3': { id: 'user-3', name: 'Charlie', avatarUrl: 'https://i.pravatar.cc/150?u=user-3', cash: 100000, inventory: [mockItems['item-5'], mockItems['item-6']], valuationReputationScore: 99, netTradeSurplus: 50000 },
};

const mockDisputeTickets: Record<string, DisputeTicket> = {
    'dispute-1': {
        id: 'dispute-1',
        tradeId: 'trade-3',
        initiatorId: 'user-1',
        status: 'AWAITING_EVIDENCE',
        disputeType: 'SNAD',
        initiatorEvidence: { statement: 'The game cartridge was clearly not "CIB" as described. The box is missing and the manual is torn.', attachments: [] },
        respondentEvidence: null,
        mediationLog: [],
        resolution: null,
        moderatorId: null,
        deadlineForNextAction: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
    },
};

const mockTrades: Record<string, Trade> = {
    'trade-1': { id: 'trade-1', proposerId: 'user-1', receiverId: 'user-2', proposerItemIds: ['item-1'], receiverItemIds: [], proposerCash: 1000, receiverCash: 0, status: TradeStatus.PENDING_ACCEPTANCE, createdAt: new Date(Date.now() - 86400000), updatedAt: new Date(Date.now() - 86400000), proposerRated: false, receiverRated: false },
    // Test case for rating expiry: Deadline is in the past, one user has rated.
    'trade-2': { id: 'trade-2', proposerId: 'user-3', receiverId: 'user-1', proposerItemIds: ['item-5'], receiverItemIds: ['item-3'], proposerCash: 0, receiverCash: 10000, status: TradeStatus.COMPLETED, createdAt: new Date(Date.now() - 172800000), updatedAt: new Date(Date.now() - 172800000), ratingDeadline: new Date(Date.now() - 1000), proposerRated: true, receiverRated: false },
    'trade-3': { id: 'trade-3', proposerId: 'user-2', receiverId: 'user-1', proposerItemIds: ['item-2'], receiverItemIds: [], proposerCash: 0, receiverCash: 0, status: TradeStatus.DISPUTE_OPENED, disputeTicketId: 'dispute-1', createdAt: new Date(Date.now() - 259200000), updatedAt: new Date(), proposerRated: false, receiverRated: false },
    'trade-4': { id: 'trade-4', proposerId: 'user-1', receiverId: 'user-3', proposerItemIds: [], receiverItemIds: ['item-6'], proposerCash: 90000, receiverCash: 0, status: TradeStatus.REJECTED, createdAt: new Date(Date.now() - 345600000), updatedAt: new Date(Date.now() - 345600000), proposerRated: false, receiverRated: false },
    'trade-5': { id: 'trade-5', proposerId: 'user-2', receiverId: 'user-3', proposerItemIds: ['item-4'], receiverItemIds: [], proposerCash: 0, receiverCash: 0, status: TradeStatus.DELIVERED_AWAITING_VERIFICATION, createdAt: new Date(Date.now() - 432000000), updatedAt: new Date(Date.now() - 86400000), proposerRated: false, receiverRated: false },
};

const mockRatings: Record<string, TradeRating> = {
    // Test case for rating expiry: A single, un-revealed rating for trade-2.
    'rating-1': {
        id: 'rating-1',
        tradeId: 'trade-2',
        raterId: 'user-3',
        rateeId: 'user-1',
        overallScore: 5,
        itemAccuracyScore: 5,
        communicationScore: 5,
        shippingSpeedScore: 5,
        publicComment: "Fantastic trader, couldn't be happier!",
        privateFeedback: null,
        createdAt: new Date(Date.now() - 170000000),
        isRevealed: false
    }
};


// --- MOCK API FUNCTIONS ---

export const fetchAllUsers = async (): Promise<User[]> => {
    console.log("API: Fetching all users");
    await new Promise(res => setTimeout(res, 200));
    return JSON.parse(JSON.stringify(Object.values(mockUsers)));
};

export const fetchUser = async (userId: string): Promise<User | null> => {
    console.log(`API: Fetching user ${userId}`);
    await new Promise(res => setTimeout(res, 100));
    return mockUsers[userId] ? JSON.parse(JSON.stringify(mockUsers[userId])) : null;
};

export const fetchTradesForUser = async (userId: string): Promise<Trade[]> => {
    console.log(`API: Fetching trades for user ${userId}`);
    await new Promise(res => setTimeout(res, 300));
    const trades = Object.values(mockTrades).filter(t => t.proposerId === userId || t.receiverId === userId);
    return JSON.parse(JSON.stringify(trades));
};

export const proposeTrade = async (proposerId: string, receiverId: string, proposerItemIds: string[], receiverItemIds: string[], proposerCash: number): Promise<Trade> => {
    console.log("API: Proposing trade");
    await new Promise(res => setTimeout(res, 500));
    const newTrade: Trade = {
        id: `trade-${Object.keys(mockTrades).length + 1}`,
        proposerId,
        receiverId,
        proposerItemIds,
        receiverItemIds,
        proposerCash,
        receiverCash: 0,
        status: TradeStatus.PENDING_ACCEPTANCE,
        createdAt: new Date(),
        updatedAt: new Date(),
        proposerRated: false,
        receiverRated: false,
    };
    mockTrades[newTrade.id] = newTrade;
    mockUsers[proposerId].cash -= proposerCash;
    return JSON.parse(JSON.stringify(newTrade));
};

export const respondToTrade = async (tradeId: string, response: 'accept' | 'reject' | 'cancel'): Promise<Trade> => {
    console.log(`API: Responding to trade ${tradeId} with ${response}`);
    await new Promise(res => setTimeout(res, 400));
    const trade = mockTrades[tradeId];
    if (!trade) throw new Error("Trade not found");

    switch (response) {
        case 'accept':
            // Simple accept for demo, goes to verification state where it can be disputed or finalized.
            trade.status = TradeStatus.DELIVERED_AWAITING_VERIFICATION;
            // In a real app, this would trigger payment/shipping flows.
            break;
        case 'reject':
            trade.status = TradeStatus.REJECTED;
            mockUsers[trade.proposerId].cash += trade.proposerCash; // Refund cash
            break;
        case 'cancel':
            trade.status = TradeStatus.CANCELLED;
            mockUsers[trade.proposerId].cash += trade.proposerCash; // Refund cash
            break;
    }
    trade.updatedAt = new Date();
    return JSON.parse(JSON.stringify(trade));
};

export const finalizeTrade = async (tradeId: string): Promise<Trade> => {
    console.log(`API: Finalizing trade ${tradeId}`);
    await new Promise(res => setTimeout(res, 300));
    const trade = mockTrades[tradeId];
    if (!trade || trade.status !== TradeStatus.DELIVERED_AWAITING_VERIFICATION) {
        throw new Error("This trade cannot be finalized at this time.");
    }

    trade.status = TradeStatus.COMPLETED;
    trade.updatedAt = new Date();
    // Set rating deadline upon completion, which triggers the rating UI
    trade.ratingDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // In a real scenario, this would trigger escrow release.
    return JSON.parse(JSON.stringify(trade));
};

// --- DISPUTE WORKFLOW FUNCTIONS ---

export const openDispute = async (tradeId: string, initiatorId: string, disputeType: DisputeType, statement: string): Promise<DisputeTicket> => {
    console.log(`API: Opening dispute for trade ${tradeId}`);
    await new Promise(res => setTimeout(res, 400));
    const trade = mockTrades[tradeId];
    if (!trade || trade.status !== TradeStatus.DELIVERED_AWAITING_VERIFICATION) {
        throw new Error("This trade is not eligible for dispute.");
    }

    const newTicket: DisputeTicket = {
        id: `dispute-${Object.keys(mockDisputeTickets).length + 1}`,
        tradeId,
        initiatorId,
        status: 'AWAITING_EVIDENCE',
        disputeType,
        initiatorEvidence: { statement, attachments: [] },
        respondentEvidence: null,
        mediationLog: [],
        resolution: null,
        moderatorId: null,
        deadlineForNextAction: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
    };
    mockDisputeTickets[newTicket.id] = newTicket;
    trade.status = TradeStatus.DISPUTE_OPENED;
    trade.disputeTicketId = newTicket.id;
    trade.updatedAt = new Date();
    return JSON.parse(JSON.stringify(newTicket));
};

export const fetchDisputeTicket = async (ticketId: string): Promise<DisputeTicket | null> => {
    console.log(`API: Fetching dispute ticket ${ticketId}`);
    await new Promise(res => setTimeout(res, 200));
    return mockDisputeTickets[ticketId] ? JSON.parse(JSON.stringify(mockDisputeTickets[ticketId])) : null;
};

export const submitEvidence = async (ticketId: string, attachments: string[]): Promise<DisputeTicket> => {
    console.log(`API: Submitting evidence for dispute ${ticketId}`);
    await new Promise(res => setTimeout(res, 400));
    const ticket = mockDisputeTickets[ticketId];
    if (!ticket || ticket.status !== 'AWAITING_EVIDENCE') throw new Error("Not awaiting evidence.");
    
    if (ticket.initiatorEvidence) {
        ticket.initiatorEvidence.attachments = attachments;
    }
    ticket.status = 'AWAITING_RESPONSE';
    ticket.deadlineForNextAction = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
    return JSON.parse(JSON.stringify(ticket));
};

export const submitResponse = async (ticketId: string, statement: string, attachments: string[]): Promise<DisputeTicket> => {
    console.log(`API: Submitting response for dispute ${ticketId}`);
    await new Promise(res => setTimeout(res, 400));
    const ticket = mockDisputeTickets[ticketId];
    if (!ticket || ticket.status !== 'AWAITING_RESPONSE') throw new Error("Not awaiting a response.");
    
    ticket.respondentEvidence = { statement, attachments };
    ticket.status = 'IN_MEDIATION';
    ticket.deadlineForNextAction = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    return JSON.parse(JSON.stringify(ticket));
};

export const sendMediationMessage = async (ticketId: string, senderId: string, text: string): Promise<DisputeTicket> => {
    console.log(`API: Sending mediation message for dispute ${ticketId}`);
    await new Promise(res => setTimeout(res, 100));
    const ticket = mockDisputeTickets[ticketId];
    if (!ticket || ticket.status !== 'IN_MEDIATION') throw new Error("Dispute not in mediation.");
    
    const message: MediationMessage = {
        id: `msg-${ticket.mediationLog.length + 1}`,
        senderId,
        text,
        timestamp: new Date()
    };
    ticket.mediationLog.push(message);
    return JSON.parse(JSON.stringify(ticket));
};

export const escalateDispute = async (ticketId: string): Promise<DisputeTicket> => {
    console.log(`API: Escalating dispute ${ticketId}`);
    await new Promise(res => setTimeout(res, 300));
    const ticket = mockDisputeTickets[ticketId];
    if (!ticket || ticket.status !== 'IN_MEDIATION') throw new Error("Dispute not in mediation.");

    ticket.status = 'ESCALATED_TO_MODERATION';
    const trade = Object.values(mockTrades).find(t => t.disputeTicketId === ticketId);
    if (trade) trade.updatedAt = new Date();
    
    return JSON.parse(JSON.stringify(ticket));
};

export const resolveDispute = async (ticketId: string, resolution: DisputeResolution, moderatorNotes: string, moderatorId: string): Promise<DisputeTicket> => {
    console.log(`API: Resolving dispute ${ticketId}`);
    await new Promise(res => setTimeout(res, 500));
    const ticket = mockDisputeTickets[ticketId];
    if (!ticket || ticket.status !== 'ESCALATED_TO_MODERATION') throw new Error("Dispute is not escalated.");

    ticket.status = 'RESOLVED';
    ticket.resolution = resolution;
    ticket.moderatorNotes = moderatorNotes;
    ticket.moderatorId = moderatorId;

    const trade = mockTrades[ticket.tradeId];
    if (trade) {
        trade.status = TradeStatus.DISPUTE_RESOLVED;
        trade.updatedAt = new Date();
        // Simulate escrow release/refund
        if (resolution === 'FULL_REFUND' && trade.proposerCash > 0) {
            const proposer = mockUsers[trade.proposerId];
            proposer.cash += trade.proposerCash;
            console.log(`API: Refunded $${trade.proposerCash / 100} to ${proposer.name}`);
        }
        // Set rating deadline after resolution
        trade.ratingDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        trade.proposerRated = false;
        trade.receiverRated = false;
    }
    return JSON.parse(JSON.stringify(ticket));
};

// --- RATING SYSTEM FUNCTIONS ---

export const fetchRatingsForUser = async (userId: string): Promise<TradeRating[]> => {
    console.log(`API: Fetching ratings for user ${userId}`);
    await new Promise(res => setTimeout(res, 150));
    const userRatings = Object.values(mockRatings).filter(r => r.raterId === userId || r.rateeId === userId);
    return JSON.parse(JSON.stringify(userRatings));
};

export const fetchRatingsForTrade = async (tradeId: string): Promise<TradeRating[]> => {
    console.log(`API: Fetching ratings for trade ${tradeId}`);
    await new Promise(res => setTimeout(res, 100));
    const tradeRatings = Object.values(mockRatings).filter(r => r.tradeId === tradeId);
    return JSON.parse(JSON.stringify(tradeRatings));
};

export const submitRating = async (ratingData: Omit<TradeRating, 'id' | 'createdAt' | 'isRevealed'>): Promise<TradeRating> => {
    console.log('API: Submitting rating', ratingData);
    await new Promise(res => setTimeout(res, 400));
    
    const trade = mockTrades[ratingData.tradeId];
    if (!trade) throw new Error("Trade not found.");
    if (!trade.ratingDeadline || new Date() > new Date(trade.ratingDeadline)) {
        throw new Error("The rating window for this trade has closed.");
    }
    
    const existingRating = Object.values(mockRatings).find(r => r.tradeId === ratingData.tradeId && r.raterId === ratingData.raterId);
    if (existingRating) throw new Error("You have already submitted a rating for this trade.");

    const newRating: TradeRating = {
        ...ratingData,
        id: `rating-${Object.keys(mockRatings).length + 1}`,
        createdAt: new Date(),
        isRevealed: false,
    };
    mockRatings[newRating.id] = newRating;

    // Update trade metadata to track who has rated
    if (ratingData.raterId === trade.proposerId) {
        trade.proposerRated = true;
    } else if (ratingData.raterId === trade.receiverId) {
        trade.receiverRated = true;
    }
    trade.updatedAt = new Date();
    
    // "Blind Reveal" Mechanism: Check if both parties have now rated.
    if (trade.proposerRated && trade.receiverRated) {
        console.log(`API: Both parties have rated trade ${trade.id}. Revealing ratings.`);
        const tradeRatings = Object.values(mockRatings).filter(r => r.tradeId === trade.id);
        for (const rating of tradeRatings) {
            rating.isRevealed = true;
        }
    }

    return JSON.parse(JSON.stringify(newRating));
};

// --- BACKGROUND JOB SIMULATION ---
export const runRatingExpiryJob = async (): Promise<{ revealedCount: number }> => {
    console.log('API: Running rating expiry job...');
    await new Promise(res => setTimeout(res, 1000)); // Simulate job latency

    let revealedCount = 0;
    const now = new Date();

    const trades = Object.values(mockTrades);
    for (const trade of trades) {
        // Check if the rating window has passed
        if (trade.ratingDeadline && new Date(trade.ratingDeadline) < now) {
            const hasOnlyOneRating = (trade.proposerRated && !trade.receiverRated) || (!trade.proposerRated && trade.receiverRated);
            
            if (hasOnlyOneRating) {
                const ratingToReveal = Object.values(mockRatings).find(r => r.tradeId === trade.id && !r.isRevealed);
                if (ratingToReveal) {
                    console.log(`API: Revealing expired rating ${ratingToReveal.id} for trade ${trade.id}`);
                    ratingToReveal.isRevealed = true;
                    revealedCount++;
                }
            }
        }
    }
    
    console.log(`API: Job finished. Revealed ${revealedCount} ratings.`);
    return { revealedCount };
};
