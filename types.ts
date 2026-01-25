// --- Core Game Entities ---

// Subscription & Fee Constants
export type SubscriptionTier = 'FREE' | 'PRO';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'none';

export const FEE_CONSTANTS = {
    FLAT_ESCROW_FEE_CENTS: 1500, // $15.00
    PRO_MONTHLY_PRICE_CENTS: 1200, // $12.00
    PRO_FREE_TRADES_LIMIT: 3
} as const;

export interface User {
    id: string;
    name: string;
    inventory: Item[];
    balance: number; // in cents
    valuationReputationScore: number; // Starts at 100
    netTradeSurplus: number; // in cents, cumulative
    city: string;
    state: string;
    interests: ItemCategory[];
    profilePictureUrl: string;
    aboutMe: string;
    accountCreatedAt: string;
    wishlist: string[]; // Array of Item IDs
    isAdmin?: boolean;
    rating?: number; // Average trade rating (1-5), computed from TradeRatings
    // Subscription fields (optional for legacy support)
    subscriptionTier?: SubscriptionTier;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionRenewsAt?: string | null; // ISO Date
    subscriptionStripeId?: string | null; // Stripe subscription ID
    tradesThisCycle?: number; // Track for fee waivers
    cycleStartedAt?: string | null; // When current billing cycle started
}

export interface Item {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    category: ItemCategory;
    condition: ItemCondition;
    estimatedMarketValue?: number; // in cents
    imageUrl?: string;
    image?: File;
    valuationSource: ValuationSource;
    apiMetadata: ApiMetadata;
}

// --- Enums and Supporting Types for Items ---

export type ItemCondition = 'NEW_SEALED' | 'CIB' | 'LOOSE' | 'GRADED' | 'OTHER';
export type ItemCategory = 'VIDEO_GAMES' | 'TCG' | 'SNEAKERS' | 'ELECTRONICS' | 'OTHER';
export type ValuationSource = 'API_VERIFIED' | 'USER_DEFINED_UNIQUE' | 'USER_DEFINED_GENERIC';

export interface ApiMetadata {
    apiName: 'PriceChartingProvider' | 'JustTCGProvider' | 'KicksDBProvider' | 'Consolidated' | null;
    apiItemId: string | null;
    baselineApiValue: number | null; // in cents
    apiConditionUsed: string | null;
    confidenceScore: number | null; // 0-100
    lastApiSyncTimestamp: Date | null;
    rawDataSnapshot: Record<string, any> | null;
}

// --- Hybrid Valuation System Types ---

export interface ItemCategoryRecord {
    id: number;
    slug: string;
    name: string;
    parentId: number | null;
    defaultApiProvider: string | null;
    conditionScale: 'standard' | 'tcg' | 'sneaker';
}

export interface ProductCatalog {
    id: number;
    pricechartingId: string | null;
    tcgplayerId: string | null;
    ebayEpid: string | null;
    stockxId: string | null;
    name: string;
    categoryId: number;
    brand: string | null;
    model: string | null;
    year: number | null;
    variant: string | null;
}

export interface ApiValuation {
    id: number;
    productId: number | null;
    itemId: number | null;
    apiProvider: string;
    apiItemId: string | null;
    conditionQueried: string | null;
    valueCents: number;
    currency: string;
    confidenceScore: number | null;
    sampleSize: number | null;
    priceRangeLowCents: number | null;
    priceRangeHighCents: number | null;
    fetchedAt: string;
    expiresAt: string | null;
}

export interface UserValueOverride {
    id: number;
    itemId: number;
    userId: number;
    overrideValueCents: number;
    reason: 'unique_item' | 'rare_variant' | 'disagree_with_api' | 'sentimental' | null;
    justification: string | null;
    evidenceUrls: string[] | null;
    status: 'pending' | 'approved' | 'flagged' | 'rejected';
    reviewedBy: number | null;
    reviewedAt: string | null;
    createdAt: string;
}

export interface ConditionAssessment {
    id: number;
    itemId: number;
    grade: 'MINT' | 'NEAR_MINT' | 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    completeness: string | null;
    packagingCondition: string | null;
    functionality: string | null;
    centeringScore: number | null;
    surfaceScore: number | null;
    edgesScore: number | null;
    cornersScore: number | null;
    valueModifierPercent: number;
    aiAssessed: boolean;
    aiConfidence: number | null;
    assessedAt: string;
    assessedBy: number | null;
}

export interface TradePriceSignal {
    id: number;
    tradeId: string;
    itemId: number | null;
    productId: number | null;
    categoryId: number | null;
    itemName: string;
    condition: string | null;
    impliedValueCents: number;
    signalConfidence: number | null;
    tradeCompletedAt: string;
}

export type EmvSource = 'api' | 'user_override' | 'trade_history' | 'user_defined' | 'ai_estimate';


// --- Trade Lifecycle ---

export interface Trade {
    id: string;
    proposerId: string;
    receiverId: string;
    proposerItemIds: string[];
    receiverItemIds: string[];
    proposerCash: number; // in cents
    receiverCash: number; // in cents
    status: TradeStatus;
    createdAt: string;
    updatedAt: string;
    disputeTicketId: string | null;

    // Logistic tracking
    proposerSubmittedTracking: boolean;
    receiverSubmittedTracking: boolean;
    proposerTrackingNumber: string | null;
    receiverTrackingNumber: string | null;

    // Verification tracking
    proposerVerifiedSatisfaction: boolean;
    receiverVerifiedSatisfaction: boolean;

    // Rating tracking
    proposerRated: boolean;
    receiverRated: boolean;
    ratingDeadline: string | null;
    parentTradeId?: string | null;
    counterMessage?: string | null;
    // Platform fee fields (optional for legacy support)
    platformFeeCents?: number; // e.g., 1500 for $15.00
    isFeeWaived?: boolean;
    feePayerId?: string | null; // Usually proposerId
}

export enum TradeStatus {
    PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    COUNTERED = 'COUNTERED',
    PAYMENT_PENDING = 'PAYMENT_PENDING',
    ESCROW_FUNDED = 'ESCROW_FUNDED',
    SHIPPING_PENDING = 'SHIPPING_PENDING',
    IN_TRANSIT = 'IN_TRANSIT',
    DELIVERED_AWAITING_VERIFICATION = 'DELIVERED_AWAITING_VERIFICATION',
    COMPLETED_AWAITING_RATING = 'COMPLETED_AWAITING_RATING',
    COMPLETED = 'COMPLETED',
    DISPUTE_OPENED = 'DISPUTE_OPENED',
    DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
}


// --- Dispute Resolution System ---

export interface DisputeTicket {
    id: string;
    tradeId: string;
    initiatorId: string;
    status: DisputeStatus;
    disputeType: DisputeType;
    createdAt: string;
    updatedAt: string;
    deadlineForNextAction: string;
    initiatorEvidence: DisputeEvidence | null;
    respondentEvidence: DisputeEvidence | null;
    mediationLog: MediationMessage[];
    resolution: DisputeResolution | null;
    moderatorNotes: string | null;
}

export interface DisputeEvidence {
    statement: string;
    attachments: string[]; // URLs or identifiers for uploaded files
}

export interface MediationMessage {
    id: string;
    senderId: string; // 'user-1', 'user-2', or 'moderator'
    text: string;
    timestamp: string;
}

export enum DisputeStatus {
    OPEN_AWAITING_RESPONSE = 'OPEN_AWAITING_RESPONSE',
    IN_MEDIATION = 'IN_MEDIATION',
    ESCALATED_TO_MODERATOR = 'ESCALATED_TO_MODERATOR',
    RESOLVED = 'RESOLVED',
    CLOSED_AUTOMATICALLY = 'CLOSED_AUTOMATICALLY',
}

export type DisputeType = 'INR' | 'SNAD' | 'COUNTERFEIT' | 'SHIPPING_DAMAGE';
export type DisputeResolution = 'TRADE_UPHELD' | 'FULL_REFUND' | 'PARTIAL_REFUND' | 'TRADE_REVERSAL';


// --- Rating and Feedback System ---

export interface TradeRating {
    id: string;
    tradeId: string;
    raterId: string;
    rateeId: string;
    overallScore: number; // 1-5
    itemAccuracyScore: number; // 1-5
    communicationScore: number; // 1-5
    shippingSpeedScore: number; // 1-5
    publicComment: string | null;
    privateFeedback: string | null;
    createdAt: string;
    isRevealed: boolean;
}