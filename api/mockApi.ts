// Fix: Implemented the full mock API with in-memory data store and logic for all operations.
import {
    User,
    Item,
    Trade,
    TradeStatus,
    DisputeTicket,
    DisputeStatus,
    TradeRating,
    DisputeType,
    ApiMetadata
} from '../types';

// --- UTILITIES ---
const deepClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
const simulateDelay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- IN-MEMORY DATABASE ---
let users = new Map<string, User>();
let items = new Map<string, Item>();
let trades = new Map<string, Trade>();
let disputeTickets = new Map<string, DisputeTicket>();
let ratings = new Map<string, TradeRating>();

// --- DATABASE INITIALIZATION ---
const initializeDb = () => {
    users.clear();
    items.clear();
    trades.clear();
    disputeTickets.clear();
    ratings.clear();

    // Create Items
    const user1Items: Item[] = [
        { id: 'item-1', ownerId: 'user-1', name: 'Super Mario 64', category: 'VIDEO_GAMES', condition: 'CIB', estimatedMarketValue: 7500, imageUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Game1', valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-123', baselineApiValue: 7500, apiConditionUsed: 'cib-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: {} } },
        { id: 'item-2', ownerId: 'user-1', name: 'Holographic Charizard', category: 'TCG', condition: 'GRADED', estimatedMarketValue: 50000, imageUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=Card1', valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'JustTCGProvider', apiItemId: 'tcg-char-1', baselineApiValue: 50000, apiConditionUsed: 'near-mint-price', confidenceScore: 90, lastApiSyncTimestamp: new Date(), rawDataSnapshot: {} } },
    ];
    const user2Items: Item[] = [
        { id: 'item-3', ownerId: 'user-2', name: 'Ocarina of Time', category: 'VIDEO_GAMES', condition: 'CIB', estimatedMarketValue: 12000, imageUrl: 'https://via.placeholder.com/150/00FF00/FFFFFF?text=Game2', valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-456', baselineApiValue: 12000, apiConditionUsed: 'cib-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: {} } },
        { id: 'item-4', ownerId: 'user-2', name: 'iPhone 13', category: 'ELECTRONICS', condition: 'LOOSE', estimatedMarketValue: 40000, imageUrl: 'https://via.placeholder.com/150/AAAAAA/FFFFFF?text=Phone', valuationSource: 'USER_DEFINED_GENERIC', apiMetadata: { apiName: null, apiItemId: null, baselineApiValue: null, apiConditionUsed: null, confidenceScore: null, lastApiSyncTimestamp: null, rawDataSnapshot: null } },
    ];
    const user3Items: Item[] = [
        { id: 'item-5', ownerId: 'user-3', name: 'Air Jordan 1s', category: 'SNEAKERS', condition: 'NEW_SEALED', estimatedMarketValue: 35000, imageUrl: 'https://via.placeholder.com/150/FFA500/FFFFFF?text=Kicks', valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'KicksDBProvider', apiItemId: 'kdb-aj1', baselineApiValue: 35000, apiConditionUsed: 'new-price', confidenceScore: 88, lastApiSyncTimestamp: new Date(), rawDataSnapshot: {} } },
    ];
    const user4Items: Item[] = [
        { id: 'item-6', ownerId: 'user-4', name: 'Playstation 5', category: 'ELECTRONICS', condition: 'NEW_SEALED', estimatedMarketValue: 45000, imageUrl: 'https://via.placeholder.com/150/800080/FFFFFF?text=PS5', valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-789', baselineApiValue: 45000, apiConditionUsed: 'new-price', confidenceScore: 98, lastApiSyncTimestamp: new Date(), rawDataSnapshot: {} } },
    ];

    [...user1Items, ...user2Items, ...user3Items, ...user4Items].forEach(item => items.set(item.id, item));

    // Create Users
    const allUsers: User[] = [
        { id: 'user-1', name: 'Alice', inventory: user1Items, cash: 20000, valuationReputationScore: 105, netTradeSurplus: 1500, city: 'San Francisco', state: 'CA', interests: ['VIDEO_GAMES', 'TCG'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-1', aboutMe: "Collector of retro games and rare cards. Always looking for a fair trade!", accountCreatedAt: '2023-01-15T10:00:00Z', wishlist: ['item-6'] },
        { id: 'user-2', name: 'Bob', inventory: user2Items, cash: 5000, valuationReputationScore: 98, netTradeSurplus: -500, city: 'Los Angeles', state: 'CA', interests: ['ELECTRONICS'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-2', aboutMe: "Tech enthusiast. I trade up my gadgets every year.", accountCreatedAt: '2023-05-20T12:00:00Z', wishlist: [] },
        { id: 'user-3', name: 'Charlie', inventory: user3Items, cash: 10000, valuationReputationScore: 115, netTradeSurplus: 8000, city: 'New York', state: 'NY', interests: ['SNEAKERS', 'TCG'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-3', aboutMe: "Sneakerhead and TCG player. Let's make a deal.", accountCreatedAt: '2022-11-01T18:00:00Z', wishlist: ['item-2', 'item-4'] },
        { id: 'user-4', name: 'Diana', inventory: user4Items, cash: 2500, valuationReputationScore: 100, netTradeSurplus: 0, city: 'San Francisco', state: 'CA', interests: ['VIDEO_GAMES', 'ELECTRONICS'], profilePictureUrl: 'https://i.pravatar.cc/150?u=user-4', aboutMe: "Just getting started here, looking for some cool retro games.", accountCreatedAt: '2023-08-01T09:00:00Z', wishlist: ['item-1'] },
    ];
    allUsers.forEach(user => users.set(user.id, user));

    // Create Trades
    const allTrades: Trade[] = [
        // Completed Trade
        { id: 'trade-1', proposerId: 'user-1', receiverId: 'user-3', proposerItemIds: [], receiverItemIds: [], proposerCash: 5000, receiverCash: 0, status: TradeStatus.COMPLETED, createdAt: '2023-07-10T10:00:00Z', updatedAt: '2023-07-12T10:00:00Z', disputeTicketId: null, proposerSubmittedTracking: true, receiverSubmittedTracking: true, proposerTrackingNumber: '123', receiverTrackingNumber: null, proposerVerifiedSatisfaction: true, receiverVerifiedSatisfaction: true, proposerRated: true, receiverRated: true, ratingDeadline: null },
        // Pending Trade
        { id: 'trade-2', proposerId: 'user-2', receiverId: 'user-1', proposerItemIds: ['item-4'], receiverItemIds: ['item-1'], proposerCash: 0, receiverCash: 0, status: TradeStatus.PENDING_ACCEPTANCE, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), disputeTicketId: null, proposerSubmittedTracking: false, receiverSubmittedTracking: false, proposerTrackingNumber: null, receiverTrackingNumber: null, proposerVerifiedSatisfaction: false, receiverVerifiedSatisfaction: false, proposerRated: false, receiverRated: false, ratingDeadline: null },
    ];
    allTrades.forEach(trade => trades.set(trade.id, trade));
};
initializeDb();

// --- API EXPORTS ---

export const resetDb = () => initializeDb();

export const fetchAllUsers = async (): Promise<User[]> => {
    await simulateDelay(100);
    return deepClone(Array.from(users.values()));
};

export const fetchUser = async (id: string): Promise<User | undefined> => {
    await simulateDelay(50);
    return deepClone(users.get(id));
};

export const fetchAllItems = async (): Promise<Item[]> => {
    await simulateDelay(150);
    return deepClone(Array.from(items.values()));
};

export const fetchTradesForUser = async (userId: string): Promise<Trade[]> => {
    await simulateDelay(200);
    return deepClone(Array.from(trades.values()).filter(t => t.proposerId === userId || t.receiverId === userId));
};

export const fetchCompletedTradesForUser = async (userId: string): Promise<Trade[]> => {
    await simulateDelay(200);
    return deepClone(Array.from(trades.values()).filter(t => (t.proposerId === userId || t.receiverId === userId) && t.status === TradeStatus.COMPLETED));
};

export const proposeTrade = async (proposerId: string, receiverId: string, proposerItemIds: string[], receiverItemIds: string[], proposerCash: number): Promise<{ updatedProposer: User }> => {
    await simulateDelay(300);
    const proposer = users.get(proposerId);
    if (!proposer) throw new Error("Proposer not found");
    if (proposer.cash < proposerCash) throw new Error("Insufficient funds");

    const newTrade: Trade = {
        id: `trade-${Date.now()}`,
        proposerId,
        receiverId,
        proposerItemIds,
        receiverItemIds,
        proposerCash,
        receiverCash: 0, // In this UI, only proposer adds cash initially
        status: TradeStatus.PENDING_ACCEPTANCE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        disputeTicketId: null,
        proposerSubmittedTracking: false,
        receiverSubmittedTracking: false,
        proposerTrackingNumber: null,
        receiverTrackingNumber: null,
        proposerVerifiedSatisfaction: false,
        receiverVerifiedSatisfaction: false,
        proposerRated: false,
        receiverRated: false,
        ratingDeadline: null,
    };
    trades.set(newTrade.id, newTrade);
    
    // In a real app, only the user object would be returned.
    // Here we return it to simulate context update.
    return { updatedProposer: deepClone(proposer) };
};

const _updateUserReputation = (user: User, change: number) => {
    user.valuationReputationScore += change;
};

export const respondToTrade = async (tradeId: string, response: 'accept' | 'reject'): Promise<Trade> => {
    await simulateDelay(400);
    const trade = trades.get(tradeId);
    if (!trade || trade.status !== TradeStatus.PENDING_ACCEPTANCE) throw new Error("Trade not found or not pending");

    if (response === 'reject') {
        trade.status = TradeStatus.REJECTED;
        trade.updatedAt = new Date().toISOString();
        return deepClone(trade);
    }

    // Handle acceptance
    const proposer = users.get(trade.proposerId);
    const receiver = users.get(trade.receiverId);
    if (!proposer || !receiver) throw new Error("Users in trade not found");

    // Calculate values
    const getValue = (itemIds: string[]) => itemIds.reduce((sum, id) => sum + (items.get(id)?.estimatedMarketValue || 0), 0);
    const proposerValue = getValue(trade.proposerItemIds) + trade.proposerCash;
    const receiverValue = getValue(trade.receiverItemIds) + trade.receiverCash;

    // Update reputation
    if (proposerValue > receiverValue * 1.2) { // Proposer overvalued their offer by > 20%
        _updateUserReputation(proposer, -10);
        _updateUserReputation(receiver, 1);
    } else { // Fair or favorable trade
        _updateUserReputation(proposer, 1);
        _updateUserReputation(receiver, 1);
    }

    // Update net trade surplus
    proposer.netTradeSurplus += (receiverValue - proposerValue);
    receiver.netTradeSurplus += (proposerValue - receiverValue);

    // Swap items
    const proposerItems = trade.proposerItemIds.map(id => items.get(id)!);
    const receiverItems = trade.receiverItemIds.map(id => items.get(id)!);
    proposerItems.forEach(item => { item.ownerId = receiver.id; });
    receiverItems.forEach(item => { item.ownerId = proposer.id; });
    proposer.inventory = proposer.inventory.filter(i => !trade.proposerItemIds.includes(i.id)).concat(receiverItems);
    receiver.inventory = receiver.inventory.filter(i => !trade.receiverItemIds.includes(i.id)).concat(proposerItems);

    // Swap cash
    proposer.cash -= trade.proposerCash;
    proposer.cash += trade.receiverCash;
    receiver.cash -= trade.receiverCash;
    receiver.cash += trade.proposerCash;

    // Update trade status (simplified flow for mock)
    const ratingDeadline = new Date();
    ratingDeadline.setDate(ratingDeadline.getDate() + 7);
    trade.status = TradeStatus.COMPLETED_AWAITING_RATING;
    trade.ratingDeadline = ratingDeadline.toISOString();
    trade.updatedAt = new Date().toISOString();

    return deepClone(trade);
};

export const cancelTrade = async (tradeId: string, userId: string): Promise<Trade> => {
    await simulateDelay(200);
    const trade = trades.get(tradeId);
    if (!trade) throw new Error("Trade not found");
    if (trade.proposerId !== userId) throw new Error("Only the proposer can cancel");
    if (trade.status !== TradeStatus.PENDING_ACCEPTANCE) throw new Error("Can only cancel pending trades");

    trade.status = TradeStatus.CANCELLED;
    trade.updatedAt = new Date().toISOString();
    return deepClone(trade);
};

export const toggleWishlistItem = async (userId: string, itemId: string): Promise<User> => {
    await simulateDelay(150);
    const user = users.get(userId);
    if (!user) throw new Error("User not found");

    const index = user.wishlist.indexOf(itemId);
    if (index > -1) {
        user.wishlist.splice(index, 1);
    } else {
        user.wishlist.push(itemId);
    }
    return deepClone(user);
};

export interface DashboardData {
    nearbyItems: Item[];
    recommendedItems: Item[];
    topTraderItems: Item[];
}

export const fetchDashboardData = async (userId: string): Promise<DashboardData> => {
    await simulateDelay(500);
    const currentUser = users.get(userId);
    if (!currentUser) throw new Error("Current user not found");

    const allItemsList = Array.from(items.values()).filter(i => i.ownerId !== userId);
    const allUsersList = Array.from(users.values());

    const nearbyItems = allItemsList.filter(item => {
        const owner = users.get(item.ownerId);
        return owner?.state === currentUser.state;
    }).slice(0, 10);
    
    const recommendedItems = allItemsList.filter(item => 
        currentUser.interests.includes(item.category)
    ).slice(0, 10);

    const topTraders = allUsersList.sort((a, b) => b.valuationReputationScore - a.valuationReputationScore).slice(0, 3);
    const topTraderIds = new Set(topTraders.map(u => u.id));
    const topTraderItems = allItemsList.filter(item => topTraderIds.has(item.ownerId)).slice(0, 10);

    return deepClone({
        nearbyItems,
        recommendedItems,
        topTraderItems
    });
};

export const submitRating = async (tradeId: string, raterId: string, formData: Omit<TradeRating, 'id' | 'tradeId' | 'raterId' | 'rateeId' | 'createdAt' | 'isRevealed'>): Promise<void> => {
    await simulateDelay(300);
    const trade = trades.get(tradeId);
    if (!trade) throw new Error("Trade not found");

    const rateeId = trade.proposerId === raterId ? trade.receiverId : trade.proposerId;
    const newRating: TradeRating = {
        id: `rating-${Date.now()}`,
        tradeId,
        raterId,
        rateeId,
        createdAt: new Date().toISOString(),
        isRevealed: false, // will be revealed once both rate
        ...formData
    };
    ratings.set(newRating.id, newRating);

    if (raterId === trade.proposerId) {
        trade.proposerRated = true;
    } else {
        trade.receiverRated = true;
    }

    if (trade.proposerRated && trade.receiverRated) {
        trade.status = TradeStatus.COMPLETED;
    }
};

// --- SIMPLIFIED MOCKS FOR OTHER ACTIONS ---
export const submitPayment = async (tradeId: string, userId: string): Promise<Trade> => {
    await simulateDelay(250);
    const trade = trades.get(tradeId)!;
    trade.status = TradeStatus.SHIPPING_PENDING;
    trade.updatedAt = new Date().toISOString();
    return deepClone(trade);
};

export const submitTracking = async (tradeId: string, userId: string, trackingNumber: string): Promise<Trade> => {
    await simulateDelay(250);
    const trade = trades.get(tradeId)!;
    if(trade.proposerId === userId) trade.proposerSubmittedTracking = true;
    if(trade.receiverId === userId) trade.receiverSubmittedTracking = true;
    trade.status = TradeStatus.IN_TRANSIT;
    trade.updatedAt = new Date().toISOString();
    return deepClone(trade);
};

export const verifySatisfaction = async (tradeId: string, userId: string): Promise<Trade> => {
    await simulateDelay(250);
    const trade = trades.get(tradeId)!;
    if(trade.proposerId === userId) trade.proposerVerifiedSatisfaction = true;
    if(trade.receiverId === userId) trade.receiverVerifiedSatisfaction = true;

    if (trade.proposerVerifiedSatisfaction && trade.receiverVerifiedSatisfaction) {
        trade.status = TradeStatus.COMPLETED_AWAITING_RATING;
    }
    trade.updatedAt = new Date().toISOString();
    return deepClone(trade);
};

export const openDispute = async (tradeId: string, initiatorId: string, disputeType: DisputeType, statement: string): Promise<DisputeTicket> => {
    await simulateDelay(300);
    const trade = trades.get(tradeId)!;
    trade.status = TradeStatus.DISPUTE_OPENED;

    const newDispute: DisputeTicket = {
        id: `dispute-${tradeId}`,
        tradeId,
        initiatorId,
        status: DisputeStatus.OPEN_AWAITING_RESPONSE,
        disputeType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deadlineForNextAction: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        initiatorEvidence: { statement, attachments: [] },
        respondentEvidence: null,
        mediationLog: [],
        resolution: null,
        moderatorNotes: null,
    };
    trade.disputeTicketId = newDispute.id;
    disputeTickets.set(newDispute.id, newDispute);
    return deepClone(newDispute);
};

// This is an internal function for testing, not to be used in the app
export const _internal = {
    items
};
