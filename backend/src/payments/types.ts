/**
 * Payment System Types
 * Provider-agnostic interfaces for payment and escrow operations
 */

// Escrow status enum
export enum EscrowStatus {
    PENDING = 'PENDING',           // Awaiting payment
    FUNDED = 'FUNDED',             // Funds held in escrow
    RELEASED = 'RELEASED',         // Released to recipient
    REFUNDED = 'REFUNDED',         // Returned to payer
    PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
    DISPUTED = 'DISPUTED',         // Under dispute review
}

// Payment intent status
export enum PaymentStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

// Core types
export interface EscrowHold {
    id: string;
    tradeId: string;
    payerId: number;
    recipientId: number;
    amount: number;
    status: EscrowStatus;
    provider: string;
    providerReference: string | null;  // e.g., Stripe PaymentIntent ID
    createdAt: string;
    updatedAt: string;
}

export interface PaymentIntent {
    id: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    clientSecret?: string;  // For frontend payment confirmation (Stripe)
    providerReference: string | null;
    metadata: Record<string, string>;
}

export interface Payout {
    id: string;
    recipientId: number;
    amount: number;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    provider: string;
    providerReference: string | null;
    createdAt: string;
}

// Provider interface - the key abstraction
export interface PaymentProvider {
    readonly name: string;

    /**
     * Create a payment intent for funding escrow
     * @returns PaymentIntent with client secret for frontend confirmation
     */
    createPaymentIntent(
        amount: number,
        currency: string,
        tradeId: string,
        payerId: number,
        metadata?: Record<string, string>
    ): Promise<PaymentIntent>;

    /**
     * Capture/confirm a payment (after frontend confirmation)
     */
    capturePayment(paymentIntentId: string): Promise<void>;

    /**
     * Refund a payment
     */
    refundPayment(
        paymentIntentId: string,
        amount?: number  // Partial refund if specified
    ): Promise<void>;

    /**
     * Hold funds in escrow
     * For mock provider, this is instant
     * For real providers, this may require frontend confirmation first
     */
    holdFunds(
        amount: number,
        tradeId: string,
        payerId: number,
        recipientId: number
    ): Promise<EscrowHold>;

    /**
     * Release held funds to recipient
     */
    releaseFunds(escrowHoldId: string): Promise<void>;

    /**
     * Refund held funds to payer
     */
    refundHeldFunds(escrowHoldId: string, amount?: number): Promise<void>;

    /**
     * Get escrow hold status
     */
    getEscrowHold(escrowHoldId: string): Promise<EscrowHold | null>;

    /**
     * Get escrow hold for a trade
     */
    getEscrowHoldForTrade(tradeId: string): Promise<EscrowHold | null>;
}

// Cash differential calculation result
export interface CashDifferential {
    payerId: number | null;      // Who needs to pay (null if no cash needed)
    recipientId: number | null;  // Who receives the cash
    amount: number;              // Amount in dollars
    description: string;         // Human-readable description
}
