// Fix: Populated file with necessary type definitions.
export type ItemCondition = 'NEW_SEALED' | 'CIB' | 'LOOSE' | 'GRADED' | 'OTHER';
export type ItemCategory = 'VIDEO_GAMES' | 'TCG' | 'SNEAKERS' | 'OTHER';
export type ValuationSource = 'API_VERIFIED' | 'USER_DEFINED_ESTIMATE' | 'USER_DEFINED_UNIQUE';

export interface ApiMetadata {
    apiName: 'PriceChartingProvider' | 'JustTCGProvider' | 'KicksDBProvider' | 'Consolidated' | null;
    apiItemId: string | null;
    baselineApiValue: number | null; // in cents
    apiConditionUsed: string | null;
    confidenceScore: number | null; // 0-100
    lastApiSyncTimestamp: Date | null;
    rawDataSnapshot: Record<string, any> | null;
}

export interface Item {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    category: ItemCategory;
    condition: ItemCondition;
    estimatedMarketValue: number; // in cents
    valuationSource: ValuationSource;
    apiMetadata: ApiMetadata;
}

export interface User {
    id: string;
    name: string;
    avatarUrl: string;
    cash: number; // in cents
    inventory: Item[];
    valuationReputationScore: number;
    netTradeSurplus: number; // in cents
}

export enum TradeStatus {
    // Initial Negotiation
    PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE', // Awaiting response
    REJECTED = 'REJECTED',
    ACCEPTED = 'ACCEPTED', // Trade accepted, moving to financial/logistics

    // Financial States (if cash supplement > 0)
    PAYMENT_PENDING = 'PAYMENT_PENDING', // Awaiting escrow funding
    PAYMENT_FAILED = 'PAYMENT_FAILED',
    ESCROW_FUNDED = 'ESCROW_FUNDED', // Funds held by Stripe in platform account

    // Logistics States
    SHIPPING_PENDING = 'SHIPPING_PENDING', // Awaiting tracking numbers
    IN_TRANSIT = 'IN_TRANSIT', // Shipped

    // Verification & Dispute States
    // Delivered, Inspection Window (e.g., 72 hours) open
    DELIVERED_AWAITING_VERIFICATION = 'DELIVERED_AWAITING_VERIFICATION',
    DISPUTE_OPENED = 'DISPUTE_OPENED', // A user has raised an issue

    // Terminal States
    COMPLETED = 'COMPLETED', // Verified by users or window expired. Funds released.
    CANCELLED = 'CANCELLED', // Cancelled before ESCROW_FUNDED or SHIPPING_PENDING
    // Moderator finalized the trade (funds released or refunded)
    DISPUTE_RESOLVED = 'DISPUTE_RESOLVED'
}

export type DisputeStatus = 'AWAITING_EVIDENCE' | 'AWAITING_RESPONSE' | 'IN_MEDIATION' | 'ESCALATED_TO_MODERATION' | 'RESOLVED';
// Item Not Received, Significantly Not As Described
export type DisputeType = 'INR' | 'SNAD' | 'COUNTERFEIT' | 'SHIPPING_DAMAGE';

export interface MediationMessage {
    id: string;
    senderId: string;
    text: string;
    timestamp: Date;
}

export interface DisputeTicket {
    id: string;
    tradeId: string;
    initiatorId: string;
    status: DisputeStatus;
    disputeType: DisputeType;
    // Evidence Handling (Use Pre-signed S3 URLs for secure uploads)
    initiatorEvidence: { statement: string, attachments: string[] } | null;
    respondentEvidence: { statement: string, attachments: string[] } | null;
    mediationLog: MediationMessage[];
    resolution: 'FULL_REFUND' | 'PARTIAL_REFUND' | 'TRADE_REVERSAL' | 'TRADE_UPHELD' | null;
    moderatorId: string | null;
    deadlineForNextAction: Date;
}


export interface Trade {
    id: string;
    proposerId: string;
    receiverId: string;
    proposerItemIds: string[];
    receiverItemIds: string[];
    proposerCash: number; // in cents
    receiverCash: number; // in cents
    status: TradeStatus;
    createdAt: Date;
    updatedAt: Date;
    disputeTicketId?: string | null;
}