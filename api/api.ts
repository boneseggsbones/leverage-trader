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
    // Subscription fields
    subscriptionTier: raw.subscriptionTier || 'FREE',
    subscriptionStatus: raw.subscriptionStatus || 'none',
    tradesThisCycle: raw.tradesThisCycle || 0,
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

export const fetchDashboardData = async (params?: { city?: string; state?: string; distance?: number }): Promise<any> => {
    const queryParams = new URLSearchParams();
    if (params?.city) queryParams.append('city', params.city);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.distance) queryParams.append('distance', String(params.distance));

    const queryString = queryParams.toString();
    const url = queryString ? `${API_URL}/dashboard?${queryString}` : `${API_URL}/dashboard`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
    }
    const raw = await response.json();
    return {
        nearbyItems: (raw.nearbyItems || []).map(normalizeItem),
        recommendedItems: (raw.recommendedItems || []).map(normalizeItem),
        topTraderItems: (raw.topTraderItems || []).map(normalizeItem),
        searchLocation: raw.searchLocation || null,
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

export const fetchCompletedTradesForUser = async (userId: string | number): Promise<Trade[]> => {
    const trades = await fetchTradesForUser(userId);
    return trades.filter(t => t.status === 'COMPLETED' || t.status === 'DISPUTE_RESOLVED');
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

// =====================================================
// VALUATION API FUNCTIONS
// =====================================================

export interface CategoryData {
    id: number;
    slug: string;
    name: string;
    parent_id: number | null;
    default_api_provider: string | null;
    condition_scale: string;
}

export interface ItemValuationData {
    item: {
        id: number;
        name: string;
        current_emv_cents: number | null;
        emv_source: string | null;
        emv_confidence: number | null;
        condition: string | null;
    };
    apiValuations: Array<{
        id: number;
        api_provider: string;
        value_cents: number;
        confidence_score: number | null;
        fetched_at: string;
        expires_at: string | null;
    }>;
    userOverrides: Array<{
        id: number;
        override_value_cents: number;
        reason: string | null;
        justification: string | null;
        status: string;
        created_at: string;
    }>;
    conditionAssessment: {
        grade: string;
        value_modifier_percent: number;
    } | null;
}

export interface SimilarPricesData {
    item: {
        id: number;
        name: string;
        product_id: number | null;
        category_id: number | null;
    };
    signals: Array<{
        id: number;
        item_name: string;
        condition: string | null;
        implied_value_cents: number;
        trade_completed_at: string;
        relevance: number;
    }>;
    stats: {
        count: number;
        avgPriceCents: number;
        minPriceCents: number;
        maxPriceCents: number;
    } | null;
}

export const fetchCategories = async (): Promise<CategoryData[]> => {
    const response = await fetch(`${API_URL}/categories`);
    if (!response.ok) {
        throw new Error('Failed to fetch categories');
    }
    return response.json();
};

export const fetchItemValuations = async (itemId: string | number): Promise<ItemValuationData> => {
    const response = await fetch(`${API_URL}/items/${itemId}/valuations`);
    if (!response.ok) {
        throw new Error('Failed to fetch item valuations');
    }
    return response.json();
};

export const submitValueOverride = async (
    itemId: string | number,
    userId: string | number,
    overrideValueCents: number,
    reason?: string,
    justification?: string
): Promise<{ id: number; status: string }> => {
    const response = await fetch(`${API_URL}/items/${itemId}/valuations/override`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, overrideValueCents, reason, justification }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to submit value override: ${text}`);
    }
    return response.json();
};

export const fetchSimilarPrices = async (itemId: string | number): Promise<SimilarPricesData> => {
    const response = await fetch(`${API_URL}/items/${itemId}/similar-prices`);
    if (!response.ok) {
        throw new Error('Failed to fetch similar prices');
    }
    return response.json();
};

// =====================================================
// PRICING API FUNCTIONS
// =====================================================

export interface RefreshValuationResult {
    success: boolean;
    emvCents: number | null;
    source: string;
    confidence: number | null;
    message: string;
}

export interface ExternalProduct {
    id: string;
    name: string;
    platform: string;
    provider: string;
}

export interface ExternalSearchResult {
    products: ExternalProduct[];
    apiConfigured: boolean;
}

export interface PricingStatus {
    configured: boolean;
    providers: Array<{
        name: string;
        configured: boolean;
        description: string;
    }>;
}

export const refreshItemValuation = async (itemId: string | number): Promise<RefreshValuationResult> => {
    const response = await fetch(`${API_URL}/items/${itemId}/refresh-valuation`, {
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error('Failed to refresh valuation');
    }
    return response.json();
};

export const searchExternalProducts = async (query: string): Promise<ExternalSearchResult> => {
    const response = await fetch(`${API_URL}/external/products/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
        throw new Error('Failed to search external products');
    }
    return response.json();
};

export const linkItemToProduct = async (
    itemId: string | number,
    pricechartingId: string,
    productName: string,
    consoleName: string
): Promise<{ success: boolean; productId: number | null; message: string; valuation?: RefreshValuationResult }> => {
    const response = await fetch(`${API_URL}/items/${itemId}/link-product`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pricechartingId, productName, consoleName }),
    });
    if (!response.ok) {
        throw new Error('Failed to link item to product');
    }
    return response.json();
};

export const getPricingStatus = async (): Promise<PricingStatus> => {
    const response = await fetch(`${API_URL}/pricing/status`);
    if (!response.ok) {
        throw new Error('Failed to get pricing status');
    }
    return response.json();
};

// =====================================================
// TRUST & SAFETY: RATINGS API FUNCTIONS
// =====================================================

export interface RatingSubmission {
    overallScore: number;
    itemAccuracyScore?: number;
    communicationScore?: number;
    shippingSpeedScore?: number;
    publicComment?: string | null;
    privateFeedback?: string | null;
}

export interface RatingResult {
    ratingId: number;
    tradeId: string;
    bothRated: boolean;
    tradeStatus: string;
}

export interface UserRatingsData {
    ratings: Array<{
        id: number;
        trade_id: string;
        rater_id: number;
        rater_name: string;
        overall_score: number;
        item_accuracy_score: number;
        communication_score: number;
        shipping_speed_score: number;
        public_comment: string | null;
        created_at: string;
    }>;
    stats: {
        totalRatings: number;
        avgOverall: number | null;
        avgItemAccuracy: number | null;
        avgCommunication: number | null;
        avgShippingSpeed: number | null;
    } | null;
}

export const submitRating = async (
    tradeId: string,
    raterId: string | number,
    ratingData: RatingSubmission
): Promise<RatingResult> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raterId, ...ratingData }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to submit rating: ${text}`);
    }
    return response.json();
};

export const fetchUserRatings = async (userId: string | number): Promise<UserRatingsData> => {
    const response = await fetch(`${API_URL}/users/${userId}/ratings`);
    if (!response.ok) {
        throw new Error('Failed to fetch user ratings');
    }
    return response.json();
};

// =====================================================
// TRUST & SAFETY: DISPUTE API FUNCTIONS
// =====================================================

export interface DisputeData {
    id: string;
    trade_id: string;
    initiator_id: number;
    respondent_id: number;
    initiator_name: string;
    respondent_name: string;
    dispute_type: string;
    status: string;
    initiator_statement: string | null;
    respondent_statement: string | null;
    resolution: string | null;
    resolution_notes: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

export const fetchDispute = async (disputeId: string): Promise<DisputeData> => {
    const response = await fetch(`${API_URL}/disputes/${disputeId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch dispute');
    }
    return response.json();
};

export const respondToDispute = async (
    disputeId: string,
    respondentId: string | number,
    statement: string
): Promise<{ id: string; status: string }> => {
    const response = await fetch(`${API_URL}/disputes/${disputeId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondentId, statement }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to respond to dispute: ${text}`);
    }
    return response.json();
};

export const resolveDispute = async (
    disputeId: string,
    resolution: string,
    resolverNotes?: string
): Promise<{ id: string; status: string; resolution: string }> => {
    const response = await fetch(`${API_URL}/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution, resolverNotes }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to resolve dispute: ${text}`);
    }
    return response.json();
};

// =====================================================
// SHIPPING TRACKING
// =====================================================

export interface TrackingInfo {
    trackingNumber: string;
    carrier: string;
    status: string;
    statusDetail: string | null;
    location: string | null;
    estimatedDelivery: string | null;
    deliveredAt: string | null;
    lastUpdated: string;
}

export interface TrackingData {
    tradeId: string;
    tradeStatus: string;
    proposer: TrackingInfo | null;
    receiver: TrackingInfo | null;
    bothSubmitted: boolean;
    bothDelivered: boolean;
}

export const fetchTrackingStatus = async (tradeId: string): Promise<TrackingData> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/tracking`);
    if (!response.ok) {
        throw new Error('Failed to fetch tracking status');
    }
    return response.json();
};

// =====================================================
// COUNTER-OFFERS
// =====================================================

export interface CounterOfferData {
    proposerItemIds?: string[];
    receiverItemIds?: string[];
    proposerCash?: number;
    receiverCash?: number;
    message?: string;
}

export interface CounterOfferResult {
    originalTradeId: string;
    originalStatus: string;
    counterTrade: {
        id: string;
        status: string;
        proposerId: string;
        receiverId: string;
        parentTradeId: string;
        message: string | null;
    };
}

export const submitCounterOffer = async (
    tradeId: string,
    userId: string | number,
    counterData: CounterOfferData
): Promise<CounterOfferResult> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...counterData }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to submit counter-offer: ${text}`);
    }
    return response.json();
};

// =====================================================
// ANALYTICS API
// =====================================================

export interface UserAnalytics {
    totalTrades: number;
    completedTrades: number;
    totalValueTraded: number;
    netTradeSurplus: number;
    avgRating: number | null;
    ratingCount: number;
    tradesByMonth: { month: string; count: number }[];
    tradesByStatus: { status: string; count: number }[];
    topTradingPartners: { userId: string; name: string; count: number }[];
}

export interface ItemValuationHistory {
    itemId: number;
    name: string;
    currentValueCents: number;
    valuations: { date: string; valueCents: number; source: string }[];
}

export const fetchUserAnalytics = async (userId: string | number): Promise<UserAnalytics> => {
    const response = await fetch(`${API_URL}/analytics/user/${userId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user analytics');
    }
    return response.json();
};

export const fetchItemValuationHistory = async (itemId: string | number): Promise<ItemValuationHistory> => {
    const response = await fetch(`${API_URL}/analytics/item/${itemId}/history`);
    if (!response.ok) {
        throw new Error('Failed to fetch item valuation history');
    }
    return response.json();
};

// =====================================================
// ESCROW API
// =====================================================

export interface CashDifferential {
    payerId: number | null;
    recipientId: number | null;
    amount: number;
    description: string;
}

export interface EscrowHold {
    id: string;
    tradeId: string;
    payerId: number;
    recipientId: number;
    amount: number;
    status: 'PENDING' | 'FUNDED' | 'RELEASED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'DISPUTED';
    provider: string;
    providerReference: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EscrowStatus {
    hasEscrow: boolean;
    escrowHold: EscrowHold | null;
    cashDifferential: CashDifferential;
}

export const fetchEscrowStatus = async (tradeId: string): Promise<EscrowStatus> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/escrow`);
    if (!response.ok) {
        throw new Error('Failed to fetch escrow status');
    }
    return response.json();
};

export const fetchCashDifferential = async (tradeId: string): Promise<CashDifferential> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/cash-differential`);
    if (!response.ok) {
        throw new Error('Failed to fetch cash differential');
    }
    return response.json();
};

export interface CreatePaymentIntentResult {
    success: boolean;
    escrowHoldId: string;
    amount: number;
    provider: string;
    clientSecret: string | null;
    requiresConfirmation: boolean;
}

export const createPaymentIntent = async (tradeId: string, userId: string | number): Promise<CreatePaymentIntentResult> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create payment intent: ${text}`);
    }
    return response.json();
};

export const fundEscrow = async (tradeId: string, userId: string | number): Promise<{
    success: boolean;
    escrowHold: EscrowHold;
    requiresConfirmation: boolean;
}> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/fund-escrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fund escrow: ${text}`);
    }
    return response.json();
};

export const releaseEscrow = async (tradeId: string, userId: string | number): Promise<{
    success: boolean;
    message: string;
}> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/release-escrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to release escrow: ${text}`);
    }
    return response.json();
};

export const refundEscrow = async (tradeId: string, userId: string | number, amount?: number): Promise<{
    success: boolean;
    message: string;
}> => {
    const response = await fetch(`${API_URL}/trades/${tradeId}/refund-escrow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to refund escrow: ${text}`);
    }
    return response.json();
};

// =====================================================
// NOTIFICATION API
// =====================================================

export interface UserNotification {
    id: string;
    userId: string;
    type: string;
    tradeId: string | null;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

export interface NotificationsResponse {
    notifications: UserNotification[];
    unreadCount: number;
}

export const fetchNotifications = async (userId: string | number): Promise<NotificationsResponse> => {
    const response = await fetch(`${API_URL}/notifications?userId=${userId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch notifications');
    }
    return response.json();
};

export const markNotificationRead = async (notificationId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        throw new Error('Failed to mark notification as read');
    }
    return response.json();
};

export const markAllNotificationsRead = async (userId: string | number): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
    }
    return response.json();
};

// =====================================================
// WISHLIST MATCH API
// =====================================================

export interface WishlistMatch {
    userId: number;
    userName: string;
    matchScore: number;
    theirWishlistItems: { id: number; name: string }[];
    yourWishlistItems: { id: number; name: string }[];
    reason: string;
}

export const fetchWishlistMatches = async (userId: string | number): Promise<WishlistMatch[]> => {
    const response = await fetch(`${API_URL}/users/${userId}/wishlist-matches`);
    if (!response.ok) {
        throw new Error('Failed to fetch wishlist matches');
    }
    return response.json();
};

// =====================================================
// PAYMENT METHODS API
// =====================================================

export type PaymentProvider = 'stripe_card' | 'stripe_bank' | 'venmo' | 'paypal' | 'coinbase';

export interface PaymentMethod {
    id: number;
    provider: PaymentProvider;
    display_name: string;
    is_default: number;
    is_verified: number;
    connected_at: string;
    last_used_at: string | null;
    last_four?: string | null;
    brand?: string | null;
}

export const fetchPaymentMethods = async (userId: string | number): Promise<PaymentMethod[]> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods`);
    if (!response.ok) {
        throw new Error('Failed to fetch payment methods');
    }
    return response.json();
};

export const addPaymentMethod = async (
    userId: string | number,
    provider: PaymentProvider,
    displayName: string,
    providerAccountId?: string,
    isDefault?: boolean,
    metadata?: Record<string, any>
): Promise<PaymentMethod> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, displayName, providerAccountId, isDefault, metadata }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to add payment method: ${text}`);
    }
    return response.json();
};

export const updatePaymentMethod = async (
    userId: string | number,
    methodId: number,
    updates: { displayName?: string; isDefault?: boolean }
): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods/${methodId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    });
    if (!response.ok) {
        throw new Error('Failed to update payment method');
    }
    return response.json();
};

export const deletePaymentMethod = async (
    userId: string | number,
    methodId: number
): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods/${methodId}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete payment method');
    }
    return response.json();
};

// Stripe SetupIntent for adding cards
export const createSetupIntent = async (userId: string | number): Promise<{
    clientSecret: string;
    customerId: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods/setup-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create setup intent: ${text}`);
    }
    return response.json();
};

// Confirm and save payment method after Stripe setup
export const confirmPaymentMethod = async (
    userId: string | number,
    paymentMethodId: string,
    customerId: string
): Promise<{
    id: number;
    provider: string;
    displayName: string;
    lastFour: string;
    brand: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/payment-methods/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId, customerId }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to confirm payment method: ${text}`);
    }
    return response.json();
};

// Get payment providers configuration status
export interface PaymentProvidersStatus {
    stripe: { configured: boolean; features: string[] };
    plaid: { configured: boolean; features: string[] };
    paypal: { configured: boolean; features: string[] };
    coinbase: { configured: boolean; features: string[] };
}

export const getPaymentProvidersStatus = async (): Promise<PaymentProvidersStatus> => {
    const response = await fetch(`${API_URL}/payment-providers/status`);
    if (!response.ok) {
        throw new Error('Failed to get payment providers status');
    }
    return response.json();
};

// =====================================================
// PLAID API
// =====================================================

// Create Plaid Link token for bank account connection
export const createPlaidLinkToken = async (userId: string | number): Promise<{
    linkToken: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/plaid/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to create Plaid Link token: ${text}`);
    }
    return response.json();
};

// Exchange Plaid public token for access token and save bank account
export const exchangePlaidToken = async (
    userId: string | number,
    publicToken: string,
    metadata: any
): Promise<{
    id: number;
    provider: string;
    displayName: string;
    lastFour: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/plaid/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicToken, metadata }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to exchange Plaid token: ${text}`);
    }
    return response.json();
};

// =====================================================
// STRIPE CONNECT API (Payouts)
// =====================================================

export interface StripeConnectStatus {
    hasAccount: boolean;
    onboardingComplete: boolean;
    payoutsEnabled: boolean;
    email: string | null;
}

// Get user's Stripe Connect payout account status
export const getStripeConnectStatus = async (userId: string | number): Promise<StripeConnectStatus> => {
    const response = await fetch(`${API_URL}/users/${userId}/stripe-connect/status`);
    if (!response.ok) {
        throw new Error('Failed to get Stripe Connect status');
    }
    return response.json();
};

// Start Stripe Connect onboarding (create account and get link)
export const startStripeConnectOnboarding = async (userId: string | number): Promise<{
    accountId: string;
    onboardingUrl: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/stripe-connect/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to start onboarding: ${text}`);
    }
    return response.json();
};

// Get new onboarding link (to continue incomplete onboarding)
export const getStripeConnectOnboardingLink = async (userId: string | number): Promise<{
    onboardingUrl: string;
}> => {
    const response = await fetch(`${API_URL}/users/${userId}/stripe-connect/onboard-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to get onboarding link: ${text}`);
    }
    return response.json();
};
