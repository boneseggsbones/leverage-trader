// This file simulates a backend API for the Leverage application.
// It maintains a simple in-memory database and provides async functions
// that mimic network requests.

import { 
    User, 
    Item, 
    Trade, 
    TradeStatus,
    DisputeTicket,
    DisputeStatus,
    DisputeType,
    DisputeResolution,
    TradeRating,
    DisputeEvidence
// Fix: Add .tsx extension to module imports
} from '../types.ts';

// --- MOCK DATABASE ---

const db: {
    users: Map<string, User>;
    items: Map<string, Item>;
    trades: Map<string, Trade>;
    disputes: Map<string, DisputeTicket>;
    ratings: Map<string, TradeRating[]>;
} = {
    users: new Map(),
    items: new Map(),
    trades: new Map(),
    disputes: new Map(),
    ratings: new Map(),
};

// --- HELPER FUNCTIONS ---

const simulateLatency = (delay: number = 150) => new Promise(res => setTimeout(res, delay));

const createItem = (id: string, ownerId: string, name: string, value: number, category: Item['category'], condition: Item['condition'], imageUrl: string): Item => ({
    id, ownerId, name, estimatedMarketValue: value, category, condition, imageUrl,
    valuationSource: 'API_VERIFIED',
    apiMetadata: {
        apiName: 'PriceChartingProvider', apiItemId: `pc-${id}`, baselineApiValue: value, apiConditionUsed: 'cib-price',
        confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'cib-price': value }
    }
});

const resetDb = () => {
    db.users.clear();
    db.items.clear();
    db.trades.clear();
    db.disputes.clear();
    db.ratings.clear();

    // Create Items
    const items = [
        createItem('item-1', 'user-1', 'Super Mario 64', 7500, 'VIDEO_GAMES', 'CIB', 'https://via.placeholder.com/150/FF0000/FFFFFF?text=Game1'),
        createItem('item-2', 'user-1', 'Holo Charizard', 50000, 'TCG', 'GRADED', 'https://via.placeholder.com/150/FFA500/FFFFFF?text=Card1'),
        createItem('item-3', 'user-2', 'Ocarina of Time', 12000, 'VIDEO_GAMES', 'CIB', 'https://via.placeholder.com/150/00FF00/FFFFFF?text=Game2'),
        createItem('item-4', 'user-2', 'Playstation 5', 45000, 'ELECTRONICS', 'NEW_SEALED', 'https://via.placeholder.com/150/0000FF/FFFFFF?text=PS5'),
        createItem('item-5', 'user-3', 'Air Jordans', 22000, 'SNEAKERS', 'NEW_SEALED', 'https://via.placeholder.com/150/800080/FFFFFF?text=Kicks'),
        createItem('item-6', 'user-3', 'Magic The Gathering Black Lotus', 80000, 'TCG', 'GRADED', 'https://via.placeholder.com/150/1a1a1a/FFFFFF?text=Card2'),
    ];
    items.forEach(item => db.items.set(item.id, item));
    
    // Create Users
    const users: User[] = [
        { id: 'user-1', name: 'Alice', cash: 50000, inventory: [db.items.get('item-1')!, db.items.get('item-2')!], valuationReputationScore: 105, netTradeSurplus: 15000, city: 'New York', state: 'NY', interests: ['VIDEO_GAMES', 'TCG'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-1', aboutMe: 'Collector of rare TCGs and classic Nintendo games. Looking for fair trades!', accountCreatedAt: '2023-01-15T10:00:00Z', wishlist: ['item-5'] },
        { id: 'user-2', name: 'Bob', cash: 25000, inventory: [db.items.get('item-3')!, db.items.get('item-4')!], valuationReputationScore: 98, netTradeSurplus: -5000, city: 'New York', state: 'NY', interests: ['VIDEO_GAMES', 'ELECTRONICS'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-2', aboutMe: 'Modern console enthusiast and Zelda fan. My items are always in mint condition.', accountCreatedAt: '2023-05-20T14:30:00Z', wishlist: [] },
        { id: 'user-3', name: 'Charlie', cash: 100000, inventory: [db.items.get('item-5')!, db.items.get('item-6')!], valuationReputationScore: 115, netTradeSurplus: 0, city: 'Los Angeles', state: 'CA', interests: ['SNEAKERS', 'TCG'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-3', aboutMe: 'High-end collector. Mostly interested in graded cards and unworn sneakers.', accountCreatedAt: '2022-11-01T08:00:00Z', wishlist: [] },
    ];
    users.forEach(user => db.users.set(user.id, user));

    const defaultTradeFields = {
        proposerSubmittedTracking: false,
        receiverSubmittedTracking: false,
        proposerTrackingNumber: null,
        receiverTrackingNumber: null,
        proposerVerifiedSatisfaction: false,
        receiverVerifiedSatisfaction: false,
    };

    // Create Trades
    const trades: Trade[] = [
        { id: 'trade-1', proposerId: 'user-2', receiverId: 'user-1', proposerItemIds: ['item-3'], receiverItemIds: [], proposerCash: 2000, receiverCash: 0, status: TradeStatus.PENDING_ACCEPTANCE, createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString(), disputeTicketId: null, proposerRated: false, receiverRated: false, ratingDeadline: null, ...defaultTradeFields },
        { id: 'trade-2', proposerId: 'user-1', receiverId: 'user-3', proposerItemIds: [], receiverItemIds: ['item-5'], proposerCash: 25000, receiverCash: 0, status: TradeStatus.COMPLETED_AWAITING_RATING, createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), updatedAt: new Date().toISOString(), disputeTicketId: null, proposerRated: false, receiverRated: false, ratingDeadline: new Date(Date.now() + 6 * 86400000).toISOString(), ...defaultTradeFields },
        { id: 'trade-3', proposerId: 'user-3', receiverId: 'user-2', proposerItemIds: ['item-5'], receiverItemIds: ['item-4'], proposerCash: 0, receiverCash: 10000, status: TradeStatus.REJECTED, createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(), disputeTicketId: null, proposerRated: false, receiverRated: false, ratingDeadline: null, ...defaultTradeFields },
        { id: 'trade-4', proposerId: 'user-1', receiverId: 'user-2', proposerItemIds: ['item-1'], receiverItemIds: ['item-3'], proposerCash: 0, receiverCash: 0, status: TradeStatus.COMPLETED, createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 8 * 86400000).toISOString(), disputeTicketId: null, proposerRated: true, receiverRated: true, ratingDeadline: null, ...defaultTradeFields },

    ];
    trades.forEach(trade => db.trades.set(trade.id, trade));
};

// Initialize DB on load
resetDb();


// --- EXPORTED API FUNCTIONS ---

export const fetchAllUsers = async (): Promise<User[]> => {
    await simulateLatency();
    return Array.from(db.users.values());
};

export const fetchAllItems = async (): Promise<Item[]> => {
    await simulateLatency();
    return Array.from(db.items.values());
};

export const fetchUser = async (id: string): Promise<User | null> => {
    await simulateLatency();
    return db.users.get(id) || null;
};

export const fetchTradesForUser = async (userId: string): Promise<Trade[]> => {
    await simulateLatency();
    return Array.from(db.trades.values()).filter(t => t.proposerId === userId || t.receiverId === userId);
};

export const fetchCompletedTradesForUser = async (userId: string): Promise<Trade[]> => {
    await simulateLatency();
    const completedStatuses = [TradeStatus.COMPLETED, TradeStatus.DISPUTE_RESOLVED];
    return Array.from(db.trades.values()).filter(t => 
        (t.proposerId === userId || t.receiverId === userId) && completedStatuses.includes(t.status)
    );
};

export interface DashboardData {
    nearbyItems: Item[];
    recommendedItems: Item[];
    topTraderItems: Item[];
}

export const fetchDashboardData = async (userId: string): Promise<DashboardData> => {
    await simulateLatency(400); // Simulate a slightly more complex query
    const currentUser = db.users.get(userId);
    if (!currentUser) {
        throw new Error("Current user not found for dashboard query.");
    }
    
    const allItems = Array.from(db.items.values());
    const otherUsers = Array.from(db.users.values()).filter(u => u.id !== userId);

    // Nearby Items
    const nearbyUsers = otherUsers.filter(u => u.city === currentUser.city);
    const nearbyItems = allItems.filter(item => nearbyUsers.some(u => u.id === item.ownerId));

    // Recommended Items
    const recommendedItems = allItems.filter(item => 
        item.ownerId !== currentUser.id && currentUser.interests.includes(item.category)
    );

    // Top Trader Items
    const sortedTraders = [...otherUsers].sort((a, b) => b.valuationReputationScore - a.valuationReputationScore);
    const topTraderIds = sortedTraders.slice(0, 5).map(u => u.id);
    const topTraderItems = allItems.filter(item => topTraderIds.includes(item.ownerId));

    return { nearbyItems, recommendedItems, topTraderItems };
};


export const proposeTrade = async (
    proposerId: string,
    receiverId: string,
    proposerItemIds: string[],
    receiverItemIds: string[],
    proposerCash: number // in cents
): Promise<{newTrade: Trade, updatedProposer: User}> => {
    await simulateLatency(300);
    const proposer = db.users.get(proposerId);
    if (!proposer || proposer.cash < proposerCash) {
        throw new Error("Insufficient funds or user not found.");
    }
    
    const newTrade: Trade = {
        id: `trade-${Date.now()}`,
        proposerId,
        receiverId,
        proposerItemIds,
        receiverItemIds,
        proposerCash,
        receiverCash: 0, // Receiver cash is only determined in counter-offers, not implemented here.
        status: TradeStatus.PENDING_ACCEPTANCE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        disputeTicketId: null,
        proposerRated: false,
        receiverRated: false,
        ratingDeadline: null,
        proposerSubmittedTracking: false,
        receiverSubmittedTracking: false,
        proposerTrackingNumber: null,
        receiverTrackingNumber: null,
        proposerVerifiedSatisfaction: false,
        receiverVerifiedSatisfaction: false,
    };
    db.trades.set(newTrade.id, newTrade);
    
    // "Hold" the cash and items (in a real app this would be more robust)
    const updatedProposer = { ...proposer };
    updatedProposer.cash -= proposerCash;
    updatedProposer.inventory = proposer.inventory.filter(item => !proposerItemIds.includes(item.id));
    db.users.set(proposerId, updatedProposer);

    return { newTrade, updatedProposer };
};

export const respondToTrade = async (tradeId: string, action: 'accept' | 'reject'): Promise<Trade> => {
    await simulateLatency(300);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    
    if (action === 'accept') {
        const involvesCash = trade.proposerCash > 0 || trade.receiverCash > 0;
        trade.status = involvesCash ? TradeStatus.PAYMENT_PENDING : TradeStatus.SHIPPING_PENDING;
    } else {
        trade.status = TradeStatus.REJECTED;
        // Return held items/cash
        const proposer = db.users.get(trade.proposerId);
        if (proposer) {
            proposer.cash += trade.proposerCash;
            const returnedItems = trade.proposerItemIds.map(id => db.items.get(id)!);
            proposer.inventory.push(...returnedItems);
            db.users.set(proposer.id, proposer);
        }
    }
    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);
    return trade;
};

export const cancelTrade = async (tradeId: string, cancellerId: string): Promise<Trade> => {
    await simulateLatency(300);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    if (trade.proposerId !== cancellerId) throw new Error("Only the proposer can cancel a pending trade.");
    if (trade.status !== TradeStatus.PENDING_ACCEPTANCE) throw new Error("Only pending trades can be cancelled.");

    trade.status = TradeStatus.CANCELLED;
    trade.updatedAt = new Date().toISOString();

    // Return held items/cash
    const proposer = db.users.get(trade.proposerId);
    if (proposer) {
        proposer.cash += trade.proposerCash;
        const returnedItems = trade.proposerItemIds.map(id => db.items.get(id)!);
        proposer.inventory.push(...returnedItems);
        db.users.set(proposer.id, proposer);
    }
    
    db.trades.set(tradeId, trade);
    return trade;
};


// --- NEW LIFECYCLE FUNCTIONS ---

export const submitPayment = async (tradeId: string, userId: string): Promise<Trade> => {
    await simulateLatency(500);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    if (trade.status !== TradeStatus.PAYMENT_PENDING) throw new Error("Trade is not awaiting payment.");
    // In a real app, we'd check if `userId` is the correct person to pay.

    trade.status = TradeStatus.ESCROW_FUNDED;
    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);

    // Automatically transition to next state after a brief delay
    await simulateLatency(200);
    trade.status = TradeStatus.SHIPPING_PENDING;
    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);

    return trade;
};

export const submitTracking = async (tradeId: string, userId: string, trackingNumber: string): Promise<Trade> => {
    await simulateLatency(200);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    if (trade.status !== TradeStatus.SHIPPING_PENDING && trade.status !== TradeStatus.IN_TRANSIT) {
        throw new Error("Trade is not awaiting shipping information.");
    }
    
    if (trade.proposerId === userId) {
        trade.proposerSubmittedTracking = true;
        trade.proposerTrackingNumber = trackingNumber;
    } else if (trade.receiverId === userId) {
        trade.receiverSubmittedTracking = true;
        trade.receiverTrackingNumber = trackingNumber;
    } else {
        throw new Error("User is not part of this trade.");
    }

    if (trade.proposerSubmittedTracking && trade.receiverSubmittedTracking) {
        trade.status = TradeStatus.IN_TRANSIT;
    }
    
    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);
    return trade;
};

export const markDelivered = async (tradeId: string): Promise<Trade> => {
    await simulateLatency(100);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    if (trade.status !== TradeStatus.IN_TRANSIT) throw new Error("Trade is not currently in transit.");
    
    trade.status = TradeStatus.DELIVERED_AWAITING_VERIFICATION;
    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);
    return trade;
};

export const verifySatisfaction = async (tradeId: string, userId: string): Promise<Trade> => {
    await simulateLatency(200);
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found.");
    if (trade.status !== TradeStatus.DELIVERED_AWAITING_VERIFICATION) {
        throw new Error("Trade is not awaiting verification.");
    }

    if (trade.proposerId === userId) {
        trade.proposerVerifiedSatisfaction = true;
    } else if (trade.receiverId === userId) {
        trade.receiverVerifiedSatisfaction = true;
    } else {
        throw new Error("User is not part of this trade.");
    }

    if (trade.proposerVerifiedSatisfaction && trade.receiverVerifiedSatisfaction) {
        trade.status = TradeStatus.COMPLETED_AWAITING_RATING;
        trade.ratingDeadline = new Date(Date.now() + 7 * 86400000).toISOString();
        // Here, we would execute the final asset swap in the database
    }

    trade.updatedAt = new Date().toISOString();
    db.trades.set(tradeId, trade);
    return trade;
};


// --- DISPUTE API ---

export const openDispute = async (tradeId: string, initiatorId: string, disputeType: DisputeType, statement: string): Promise<DisputeTicket> => {
    await simulateLatency();
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found");

    trade.status = TradeStatus.DISPUTE_OPENED;
    
    const newDispute: DisputeTicket = {
        id: `dispute-${tradeId}`,
        tradeId,
        initiatorId,
        disputeType,
        status: DisputeStatus.OPEN_AWAITING_RESPONSE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deadlineForNextAction: new Date(Date.now() + 3 * 86400000).toISOString(),
        initiatorEvidence: { statement, attachments: [] },
        respondentEvidence: null,
        mediationLog: [],
        resolution: null,
        moderatorNotes: null,
    };
    db.disputes.set(newDispute.id, newDispute);
    trade.disputeTicketId = newDispute.id;
    db.trades.set(tradeId, trade);
    return newDispute;
};

export const addDisputeEvidence = async (disputeId: string, evidence: DisputeEvidence): Promise<DisputeTicket> => {
    await simulateLatency();
    const dispute = db.disputes.get(disputeId);
    if (!dispute) throw new Error("Dispute not found");

    dispute.initiatorEvidence = evidence;
    dispute.updatedAt = new Date().toISOString();
    db.disputes.set(disputeId, dispute);
    return dispute;
};

export const addDisputeResponse = async (disputeId: string, evidence: DisputeEvidence): Promise<DisputeTicket> => {
    await simulateLatency();
    const dispute = db.disputes.get(disputeId);
    if (!dispute) throw new Error("Dispute not found");

    dispute.respondentEvidence = evidence;
    dispute.status = DisputeStatus.IN_MEDIATION;
    dispute.updatedAt = new Date().toISOString();
    db.disputes.set(disputeId, dispute);
    return dispute;
};

// Add more dispute functions as needed...

// --- WISHLIST API ---
export const toggleWishlistItem = async (userId: string, itemId: string): Promise<User> => {
    await simulateLatency(100);
    const user = db.users.get(userId);
    if (!user) throw new Error("User not found");

    const itemIndex = user.wishlist.indexOf(itemId);
    if (itemIndex > -1) {
        user.wishlist.splice(itemIndex, 1); // Remove item
    } else {
        user.wishlist.push(itemId); // Add item
    }
    db.users.set(userId, user);
    return { ...user }; // Return a copy
};


// --- RATING API ---

export const fetchRatingsForTrade = async (tradeId: string): Promise<TradeRating[]> => {
    await simulateLatency();
    return db.ratings.get(tradeId) || [];
};

export const submitRating = async (tradeId: string, raterId: string, ratingData: Omit<TradeRating, 'id' | 'tradeId' | 'raterId' | 'rateeId' | 'createdAt' | 'isRevealed'>): Promise<TradeRating> => {
    await simulateLatency();
    const trade = db.trades.get(tradeId);
    if (!trade) throw new Error("Trade not found");

    const rateeId = trade.proposerId === raterId ? trade.receiverId : trade.proposerId;
    const newRating: TradeRating = {
        id: `rating-${tradeId}-${raterId}`,
        tradeId,
        raterId,
        rateeId,
        ...ratingData,
        createdAt: new Date().toISOString(),
        isRevealed: false,
    };

    const tradeRatings = db.ratings.get(tradeId) || [];
    tradeRatings.push(newRating);
    db.ratings.set(tradeId, tradeRatings);

    // Update trade flags
    if (trade.proposerId === raterId) {
        trade.proposerRated = true;
    } else if (trade.receiverId === raterId) {
        trade.receiverRated = true;
    }

    // Check if both parties have rated to reveal them
    if (trade.proposerRated && trade.receiverRated) {
        const allRatingsForTrade = db.ratings.get(tradeId) || [];
        allRatingsForTrade.forEach(r => r.isRevealed = true);
        trade.status = TradeStatus.COMPLETED;
        trade.ratingDeadline = null; // Close the window
    }
    
    db.trades.set(tradeId, trade);
    return newRating;
};