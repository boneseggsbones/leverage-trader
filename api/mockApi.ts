// Fix: Populated file with mock data and API functions.
import { User, Item, Trade, TradeStatus, DisputeTicket, DisputeType } from '../types';

// --- MOCK DATABASE ---

const mockItems: Record<string, Item> = {
    'item-1': { id: 'item-1', name: 'Super Mario 64', description: 'N64 classic', imageUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=Mario64', category: 'VIDEO_GAMES', condition: 'LOOSE', estimatedMarketValue: 3000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-123', baselineApiValue: 3000, apiConditionUsed: 'loose-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'cib-price': 7500, 'loose-price': 3000 } } },
    'item-2': { id: 'item-2', name: 'Ocarina of Time', description: 'N64 masterpiece', imageUrl: 'https://via.placeholder.com/150/00FF00/FFFFFF?text=Zelda', category: 'VIDEO_GAMES', condition: 'CIB', estimatedMarketValue: 12000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-456', baselineApiValue: 12000, apiConditionUsed: 'cib-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'cib-price': 12000, 'loose-price': 5000 } } },
    'item-3': { id: 'item-3', name: 'Charizard Holo', description: 'Base Set, 1st Edition', imageUrl: 'https://via.placeholder.com/150/FFA500/FFFFFF?text=Charizard', category: 'TCG', condition: 'GRADED', estimatedMarketValue: 50000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'JustTCGProvider', apiItemId: 'tcg-char-1', baselineApiValue: 50000, apiConditionUsed: 'near-mint-price', confidenceScore: 90, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'near-mint-price': 50000 } } },
    'item-4': { id: 'item-4', name: 'Playstation 5', description: 'Disc Edition', imageUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=PS5', category: 'VIDEO_GAMES', condition: 'NEW_SEALED', estimatedMarketValue: 45000, valuationSource: 'API_VERIFIED', apiMetadata: { apiName: 'PriceChartingProvider', apiItemId: 'pc-789', baselineApiValue: 45000, apiConditionUsed: 'new-price', confidenceScore: 95, lastApiSyncTimestamp: new Date(), rawDataSnapshot: { 'new-price': 45000 } } },
    'item-5': { id: 'item-5', name: 'Air Jordan 1', description: 'Chicago colorway', imageUrl: 'https://via.placeholder.com/150/FF0000/FFFFFF?text=AJ1', category: 'SNEAKERS', condition: 'NEW_SEALED', estimatedMarketValue: 80000, valuationSource: 'USER_DEFINED_ESTIMATE', apiMetadata: { apiName: null, apiItemId: null, baselineApiValue: null, apiConditionUsed: null, confidenceScore: null, lastApiSyncTimestamp: null, rawDataSnapshot: null } },
};

const mockUsers: User[] = [
    { id: 'user-1', name: 'Alice', avatarUrl: 'https://i.pravatar.cc/150?u=user-1', cash: 10000, inventory: [mockItems['item-1'], mockItems['item-5']], valuationReputationScore: 95, netTradeSurplus: 1500 },
    { id: 'user-2', name: 'Bob', avatarUrl: 'https://i.pravatar.cc/150?u=user-2', cash: 5000, inventory: [mockItems['item-2']], valuationReputationScore: 110, netTradeSurplus: -500 },
    { id: 'user-3', name: 'Charlie', avatarUrl: 'https://i.pravatar.cc/150?u=user-3', cash: 20000, inventory: [mockItems['item-3'], mockItems['item-4']], valuationReputationScore: 80, netTradeSurplus: 2000 },
];

let mockTrades: Trade[] = [
    { id: 'trade-1', proposerId: 'user-2', receiverId: 'user-1', proposerItemIds: ['item-2'], receiverItemIds: [], proposerCash: 2000, receiverCash: 0, status: TradeStatus.PENDING_ACCEPTANCE, createdAt: new Date(Date.now() - 86400000), updatedAt: new Date(Date.now() - 86400000) },
    { id: 'trade-2', proposerId: 'user-3', receiverId: 'user-1', proposerItemIds: ['item-4'], receiverItemIds: ['item-5'], proposerCash: 0, receiverCash: 0, status: TradeStatus.PENDING_ACCEPTANCE, createdAt: new Date(Date.now() - 3600000), updatedAt: new Date(Date.now() - 3600000) },
    { id: 'trade-3', proposerId: 'user-1', receiverId: 'user-3', proposerItemIds: ['item-1'], receiverItemIds: [], proposerCash: 1000, receiverCash: 0, status: TradeStatus.COMPLETED, createdAt: new Date(Date.now() - 86400000*2), updatedAt: new Date(Date.now() - 86400000) },
    { id: 'trade-4', proposerId: 'user-2', receiverId: 'user-3', proposerItemIds: [], receiverItemIds: [], proposerCash: 500, receiverCash: 0, status: TradeStatus.REJECTED, createdAt: new Date(Date.now() - 86400000*3), updatedAt: new Date(Date.now() - 86400000*2) },
    { id: 'trade-5', proposerId: 'user-3', receiverId: 'user-1', proposerItemIds: ['item-3'], receiverItemIds: [], proposerCash: 0, receiverCash: 0, status: TradeStatus.DELIVERED_AWAITING_VERIFICATION, createdAt: new Date(Date.now() - 86400000*4), updatedAt: new Date(Date.now() - 86400000*2) },
];

let mockDisputeTickets: DisputeTicket[] = [];

// --- API FUNCTIONS ---

const simulateDelay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const fetchAllUsers = async (): Promise<User[]> => {
    await simulateDelay(300);
    return JSON.parse(JSON.stringify(mockUsers));
};

export const fetchUser = async (userId: string): Promise<User | undefined> => {
    await simulateDelay(200);
    return JSON.parse(JSON.stringify(mockUsers.find(u => u.id === userId)));
};

export const proposeTrade = async (
    proposerId: string,
    receiverId: string,
    proposerItemIds: string[],
    receiverItemIds: string[],
    proposerCash: number // in CENTS from UI
): Promise<Trade> => {
    await simulateDelay(500);
    const proposer = mockUsers.find(u => u.id === proposerId);
    if (!proposer) throw new Error("Proposer not found");
    if (proposer.cash < proposerCash) throw new Error("Insufficient funds");

    const newTrade: Trade = {
        id: `trade-${Date.now()}`,
        proposerId,
        receiverId,
        proposerItemIds,
        receiverItemIds,
        proposerCash: proposerCash,
        receiverCash: 0,
        status: TradeStatus.PENDING_ACCEPTANCE,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    mockTrades.push(newTrade);
    // In a real app, you'd update the user's cash here or on trade completion.
    // The component optimistically updates, so we'll just reflect that in the mock DB state.
    const userIndex = mockUsers.findIndex(u => u.id === proposerId);
    if(userIndex !== -1) {
        mockUsers[userIndex].cash -= newTrade.proposerCash;
    }
    
    return JSON.parse(JSON.stringify(newTrade));
};

export const fetchTradesForUser = async (userId: string): Promise<Trade[]> => {
    await simulateDelay(400);
    return JSON.parse(JSON.stringify(mockTrades.filter(t => t.proposerId === userId || t.receiverId === userId)));
};

export const respondToTrade = async (tradeId: string, response: 'accept' | 'reject' | 'cancel'): Promise<Trade> => {
    await simulateDelay(500);
    const tradeIndex = mockTrades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) throw new Error("Trade not found");
    
    const trade = mockTrades[tradeIndex];
    if (trade.status !== TradeStatus.PENDING_ACCEPTANCE) throw new Error("Trade is no longer pending");
    
    if (response === 'accept') {
        // In a real app, this would trigger payment/shipping flows. For this mock,
        // we simulate those steps and land in the state where a user can verify the received items.
        trade.status = TradeStatus.DELIVERED_AWAITING_VERIFICATION;
    } else if (response === 'reject') {
        trade.status = TradeStatus.REJECTED;
    } else if (response === 'cancel') {
        trade.status = TradeStatus.CANCELLED;
         // Refund cash to proposer
        const userIndex = mockUsers.findIndex(u => u.id === trade.proposerId);
        if(userIndex !== -1) {
            mockUsers[userIndex].cash += trade.proposerCash;
        }
    }
    
    trade.updatedAt = new Date();

    return JSON.parse(JSON.stringify(trade));
};

export const fetchDisputeTicket = async (ticketId: string): Promise<DisputeTicket | undefined> => {
    await simulateDelay(150);
    // In a real app, a background job would check for deadlines and escalate.
    // We can simulate that check here for demonstration.
    const ticketIndex = mockDisputeTickets.findIndex(t => t.id === ticketId);
    if (ticketIndex !== -1) {
        const ticket = mockDisputeTickets[ticketIndex];
        if ((ticket.status === 'AWAITING_EVIDENCE' || ticket.status === 'AWAITING_RESPONSE' || ticket.status === 'IN_MEDIATION') && new Date() > ticket.deadlineForNextAction) {
            // ticket.status = 'ESCALATED_TO_MODERATION';
            // console.log(`Dispute ${ticketId} auto-escalated due to expired deadline.`);
        }
        return JSON.parse(JSON.stringify(ticket));
    }
    return undefined;
};

export const submitEvidence = async (
    ticketId: string,
    attachments: string[]
): Promise<DisputeTicket> => {
    await simulateDelay(600);
    const ticketIndex = mockDisputeTickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) throw new Error("Dispute ticket not found");

    const ticket = mockDisputeTickets[ticketIndex];
    if (ticket.status !== 'AWAITING_EVIDENCE') {
        throw new Error("Not awaiting evidence from initiator.");
    }
    if (ticket.disputeType === 'SNAD' && attachments.length === 0) {
        throw new Error("Photos are mandatory for 'Significantly Not As Described' disputes.");
    }

    if (ticket.initiatorEvidence) {
        ticket.initiatorEvidence.attachments = attachments;
    } else {
        // This case shouldn't happen with the current flow, but for safety:
        ticket.initiatorEvidence = { statement: '', attachments };
    }

    ticket.status = 'AWAITING_RESPONSE';
    // Give the other party 72 hours to respond.
    ticket.deadlineForNextAction = new Date(Date.now() + 3 * 86400000); 

    mockDisputeTickets[ticketIndex] = ticket;

    return JSON.parse(JSON.stringify(ticket));
};

export const submitResponse = async (
    ticketId: string,
    statement: string,
    attachments: string[]
): Promise<DisputeTicket> => {
    await simulateDelay(600);
    const ticketIndex = mockDisputeTickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) throw new Error("Dispute ticket not found");
    
    const ticket = mockDisputeTickets[ticketIndex];
    if (ticket.status !== 'AWAITING_RESPONSE') {
        throw new Error("This dispute is not awaiting a response.");
    }

    ticket.respondentEvidence = { statement, attachments };
    ticket.status = 'IN_MEDIATION';
    // Set a 7-day deadline for mediation.
    ticket.deadlineForNextAction = new Date(Date.now() + 7 * 86400000);
    
    mockDisputeTickets[ticketIndex] = ticket;
    return JSON.parse(JSON.stringify(ticket));
};

export const sendMediationMessage = async (
    ticketId: string,
    senderId: string,
    text: string,
): Promise<DisputeTicket> => {
    await simulateDelay(300);
    const ticketIndex = mockDisputeTickets.findIndex(t => t.id === ticketId);
    if (ticketIndex === -1) throw new Error("Dispute ticket not found");

    const ticket = mockDisputeTickets[ticketIndex];
    if (ticket.status !== 'IN_MEDIATION') {
        throw new Error("This dispute is not currently in mediation.");
    }

    const newMessage = {
        id: `msg-${Date.now()}`,
        senderId,
        text,
        timestamp: new Date(),
    };
    
    ticket.mediationLog.push(newMessage);
    mockDisputeTickets[ticketIndex] = ticket;

    return JSON.parse(JSON.stringify(ticket));
};


export const openDispute = async (
    tradeId: string,
    initiatorId: string,
    disputeType: DisputeType,
    statement: string
): Promise<DisputeTicket> => {
    await simulateDelay(600);
    const tradeIndex = mockTrades.findIndex(t => t.id === tradeId);
    if (tradeIndex === -1) throw new Error("Trade not found");
    
    const trade = mockTrades[tradeIndex];
    
    // In a real app, there would be stricter checks here.
    if (trade.status !== TradeStatus.DELIVERED_AWAITING_VERIFICATION) {
        throw new Error("This trade is not in a state that can be disputed.");
    }
    
    trade.status = TradeStatus.DISPUTE_OPENED;
    
    const newTicket: DisputeTicket = {
        id: `dispute-${Date.now()}`,
        tradeId,
        initiatorId,
        status: 'AWAITING_EVIDENCE',
        disputeType,
        initiatorEvidence: { statement, attachments: [] },
        respondentEvidence: null,
        mediationLog: [],
        resolution: null,
        moderatorId: null,
        deadlineForNextAction: new Date(Date.now() + 2 * 86400000), // 48 hours from now
    };
    
    mockDisputeTickets.push(newTicket);
    trade.disputeTicketId = newTicket.id;
    trade.updatedAt = new Date();
    
    return JSON.parse(JSON.stringify(newTicket));
};