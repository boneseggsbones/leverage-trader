import { User } from '../types';

const API_URL = 'http://localhost:4000/api';

export const fetchAllUsers = async (): Promise<User[]> => {
    const response = await fetch(`${API_URL}/users`);
    if (!response.ok) {
        throw new Error('Failed to fetch users');
    }
    return response.json();
};

export const fetchDashboardData = async (): Promise<any> => {
    const response = await fetch(`${API_URL}/dashboard`);
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
    }
    return response.json();
};

export const toggleWishlistItem = async (userId: number, itemId: number): Promise<User> => {
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
    return response.json();
};

export const fetchUser = async (id: number): Promise<User> => {
    const response = await fetch(`${API_URL}/users/${id}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user');
    }
    return response.json();
};

export const fetchAllItems = async (): Promise<any[]> => {
    const response = await fetch(`${API_URL}/items?userId=1`); // consumer may override with query
    if (!response.ok) throw new Error('Failed to fetch items');
    return response.json();
};

export const fetchTradesForUser = async (userId: number | string): Promise<any[]> => {
    const response = await fetch(`${API_URL}/trades?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch trades');
    return response.json();
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
    return response.json();
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
    return response.json();
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
    return response.json();
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
): Promise<{ updatedProposer: User }> => {
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

    return response.json();
};
