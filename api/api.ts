import { User, Item, Trade } from '../types';

const API_URL = 'http://localhost:4000/api';

const normalizeItem = (raw: any): Item => ({
    ...raw,
    id: String(raw.id),
    ownerId: String(raw.owner_id ?? raw.ownerId ?? raw.ownerId),
    estimatedMarketValue: raw.estimatedMarketValue ?? raw.estimatedMarketValue ?? null,
});

const normalizeUser = (raw: any): User => ({
    id: String(raw.id),
    name: raw.name,
    inventory: Array.isArray(raw.inventory) ? raw.inventory.map(normalizeItem) : [],
    balance: Number(raw.balance ?? raw.cash ?? 0),
    valuationReputationScore: Number(raw.valuationReputationScore ?? raw.rating ?? 0),
    netTradeSurplus: Number(raw.netTradeSurplus ?? 0),
    city: raw.city,
    state: raw.state,
    interests: raw.interests || [],
    profilePictureUrl: raw.profilePictureUrl || raw.avatarUrl || null,
    aboutMe: raw.aboutMe || '',
    accountCreatedAt: raw.accountCreatedAt || new Date().toISOString(),
    wishlist: Array.isArray(raw.wishlist) ? raw.wishlist.map(String) : [],
});

const normalizeTrade = (raw: any): Trade => ({
    ...raw,
    id: String(raw.id),
    proposerId: String(raw.proposerId),
    receiverId: String(raw.receiverId),
    proposerItemIds: ((): string[] => {
        const v = raw.proposerItemIds;
        if (!v) return [];
        if (Array.isArray(v)) return v.map(String);
        try { return JSON.parse(v).map(String); } catch (e) { return [] }
    })(),
    receiverItemIds: ((): string[] => {
        const v = raw.receiverItemIds;
        if (!v) return [];
        if (Array.isArray(v)) return v.map(String);
        try { return JSON.parse(v).map(String); } catch (e) { return [] }
    })(),
    proposerCash: Number(raw.proposerCash || 0),
    receiverCash: Number(raw.receiverCash || 0),
});

export const fetchAllUsers = async (): Promise<User[]> => {
    const response = await fetch(`${API_URL}/users`);
    if (!response.ok) {
        throw new Error('Failed to fetch users');
    }
    const raw = await response.json();
    return raw.map(normalizeUser);
};

export const fetchDashboardData = async (): Promise<any> => {
    const response = await fetch(`${API_URL}/dashboard`);
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
    }
    const raw = await response.json();
    return {
        nearbyItems: (raw.nearbyItems || []).map(normalizeItem),
        recommendedItems: (raw.recommendedItems || []).map(normalizeItem),
        topTraderItems: (raw.topTraderItems || []).map(normalizeItem),
    };
};

export const toggleWishlistItem = async (userId: string | number, itemId: string | number): Promise<User> => {
    const response = await fetch(`${API_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, itemId }),
    });
    if (!response.ok) {
        throw new Error('Failed to toggle wishlist item');
    }
    const raw = await response.json();
    return normalizeUser(raw);
};

export const fetchUser = async (id: string | number): Promise<User> => {
    const response = await fetch(`${API_URL}/users/${id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user');
    }
    const raw = await response.json();
    return normalizeUser(raw);
};

export const fetchAllItems = async (userId?: string | number): Promise<Item[]> => {
    // Defensive: avoid sending literal 'undefined' or 'null' strings in query params
    const hasUserId = userId !== undefined && userId !== null && String(userId).toLowerCase() !== 'undefined' && String(userId).toLowerCase() !== 'null';
    const q = hasUserId ? `?userId=${userId}` : '';
    const response = await fetch(`${API_URL}/items${q}`);
    if (!response.ok) throw new Error('Failed to fetch items');
    const raw = await response.json();
    return raw.map(normalizeItem);
};

export const fetchTradesForUser = async (userId: string | number): Promise<Trade[]> => {
    if (userId === undefined || userId === null || String(userId).toLowerCase() === 'undefined') {
        throw new Error('fetchTradesForUser requires a valid userId');
    }
    const response = await fetch(`${API_URL}/trades?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch trades');
    const raw = await response.json();
    return raw.map(normalizeTrade);
};

export const respondToTrade = async (tradeId: string, responseValue: 'accept' | 'reject'): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseValue }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to respond to trade: ${text}`);
    }
    const raw = await response.json();
    return raw;
};

export const cancelTrade = async (tradeId: string, userId: number | string): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to cancel trade: ${text}`);
    }
    const raw = await response.json();
    return raw;
};

export const submitPayment = async (tradeId: string, userId: number | string): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/submit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to submit payment: ${text}`);
    }
    return response.json();
};

export const submitTracking = async (tradeId: string, userId: number | string, trackingNumber: string): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/submit-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, trackingNumber }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to submit tracking: ${text}`);
    }
    return response.json();
};

export const verifySatisfaction = async (tradeId: string, userId: number | string): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to verify satisfaction: ${text}`);
    }
    const raw = await response.json();
    // Expecting { proposer: {...}, receiver: {...} }
    return {
        proposer: normalizeUser(raw.proposer),
        receiver: normalizeUser(raw.receiver),
    };
};

export const openDispute = async (tradeId: string, initiatorId: number | string, disputeType: string, statement: string): Promise<any> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/open-dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initiatorId, disputeType, statement }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to open dispute: ${text}`);
    }
    return response.json();
};

export const proposeTrade = async (
    proposerId: number | string,
    receiverId: number | string,
    proposerItemIds: (number | string)[],
    receiverItemIds: (number | string)[],
    proposerCash: number
): Promise<{ trade: Trade; updatedProposer: User }> => {
    const response = await fetch(`${API_URL}/trades`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to propose trade: ${text}`);
    }

    const raw = await response.json();
    return {
        trade: normalizeTrade(raw.trade),
        updatedProposer: normalizeUser(raw.updatedProposer),
    };
};
