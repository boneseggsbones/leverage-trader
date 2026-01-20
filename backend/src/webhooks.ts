/**
 * Stripe Webhook Handler
 * Handles Stripe webhook events for payment lifecycle
 */

import Stripe from 'stripe';
import { db } from './database';
import { EscrowStatus } from './payments/types';

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
    apiVersion: '2025-12-15.clover',
}) : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export interface WebhookResult {
    handled: boolean;
    event: string;
    message: string;
}

/**
 * Process a Stripe webhook event
 */
export async function handleStripeWebhook(
    rawBody: Buffer,
    signature: string
): Promise<WebhookResult> {
    if (!stripe) {
        throw new Error('Stripe not configured');
    }

    if (!webhookSecret) {
        console.warn('[Webhook] No webhook secret configured - skipping signature verification');
        // In development, we can parse the event without verification
        const event = JSON.parse(rawBody.toString()) as Stripe.Event;
        return processEvent(event);
    }

    // Verify and construct the event
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return processEvent(event);
}

async function processEvent(event: Stripe.Event): Promise<WebhookResult> {
    console.log(`[Webhook] Received event: ${event.type}`);

    switch (event.type) {
        case 'payment_intent.succeeded':
            return handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);

        case 'payment_intent.payment_failed':
            return handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);

        case 'payment_intent.canceled':
            return handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);

        case 'charge.dispute.created':
            return handleDisputeCreated(event.data.object as Stripe.Dispute);

        default:
            return {
                handled: false,
                event: event.type,
                message: `Unhandled event type: ${event.type}`,
            };
    }
}

/**
 * Handle successful payment (funds authorized/captured)
 */
async function handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent
): Promise<WebhookResult> {
    const paymentIntentId = paymentIntent.id;
    const tradeId = paymentIntent.metadata?.tradeId;

    console.log(`[Webhook] PaymentIntent succeeded: ${paymentIntentId} for trade ${tradeId}`);

    // Update escrow status to FUNDED
    await updateEscrowStatus(paymentIntentId, EscrowStatus.FUNDED);

    return {
        handled: true,
        event: 'payment_intent.succeeded',
        message: `Payment confirmed for trade ${tradeId}`,
    };
}

/**
 * Handle failed payment
 */
async function handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent
): Promise<WebhookResult> {
    const paymentIntentId = paymentIntent.id;
    const tradeId = paymentIntent.metadata?.tradeId;
    const failureMessage = paymentIntent.last_payment_error?.message || 'Unknown error';

    console.log(`[Webhook] PaymentIntent failed: ${paymentIntentId} for trade ${tradeId}: ${failureMessage}`);

    // Update escrow status to FAILED
    await updateEscrowStatus(paymentIntentId, 'FAILED' as EscrowStatus);

    return {
        handled: true,
        event: 'payment_intent.payment_failed',
        message: `Payment failed for trade ${tradeId}: ${failureMessage}`,
    };
}

/**
 * Handle canceled payment (refund)
 */
async function handlePaymentIntentCanceled(
    paymentIntent: Stripe.PaymentIntent
): Promise<WebhookResult> {
    const paymentIntentId = paymentIntent.id;
    const tradeId = paymentIntent.metadata?.tradeId;

    console.log(`[Webhook] PaymentIntent canceled: ${paymentIntentId} for trade ${tradeId}`);

    // Update escrow status to REFUNDED
    await updateEscrowStatus(paymentIntentId, EscrowStatus.REFUNDED);

    return {
        handled: true,
        event: 'payment_intent.canceled',
        message: `Payment canceled for trade ${tradeId}`,
    };
}

/**
 * Handle dispute creation
 */
async function handleDisputeCreated(
    dispute: Stripe.Dispute
): Promise<WebhookResult> {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

    console.log(`[Webhook] Dispute created for charge: ${chargeId}`);

    // TODO: Create a dispute in our system and flag the trade for review

    return {
        handled: true,
        event: 'charge.dispute.created',
        message: `Dispute created for charge ${chargeId}`,
    };
}

/**
 * Update escrow status by PaymentIntent ID
 */
async function updateEscrowStatus(paymentIntentId: string, status: EscrowStatus | string): Promise<void> {
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE escrow_holds SET status = ?, updated_at = ? WHERE provider_reference = ?`,
            [status, now, paymentIntentId],
            function (err) {
                if (err) {
                    console.error(`[Webhook] Failed to update escrow status:`, err);
                    reject(err);
                } else if (this.changes === 0) {
                    console.warn(`[Webhook] No escrow found for PaymentIntent: ${paymentIntentId}`);
                    resolve();
                } else {
                    console.log(`[Webhook] Updated escrow status to ${status} for PI: ${paymentIntentId}`);
                    resolve();
                }
            }
        );
    });
}
