// --- Core Game Entities ---

export interface User {
    id: string;
    name: string;
    inventory: Item[];
    cash: number; // in cents
    valuationReputationScore: number; // Starts at 100
    netTradeSurplus: number; // in cents, cumulative
    city: string;
    state: string;
    interests: ItemCategory[];
    profilePictureUrl: string;
    aboutMe: string;
    accountCreatedAt: string;
    wishlist: number[]; // Array of Item IDs
}

export interface Item {
    id: string;
    ownerId: string;
    name: string;
    category: ItemCategory;
    condition: ItemCondition;
    estimatedMarketValue: number; // in cents
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
}

export enum TradeStatus {
    PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
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