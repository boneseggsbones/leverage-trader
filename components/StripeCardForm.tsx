/**
 * Stripe Card Payment Form
 * Uses Stripe Elements for secure card input
 */

import React, { useState } from 'react';
import {
    PaymentElement,
    Elements,
    useStripe,
    useElements,
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Load Stripe outside of component render to avoid recreating on each render
// @ts-ignore - Vite provides import.meta.env
const stripePublishableKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY)
    || 'pk_test_51SrPsKJZxfeiuvjPAyxTDvn6WPmSBg5HYwQLUfrNyTpxyZiDtSx3ZR5MnKE6h95B35QUcLNVWKCYhZpjT8Lkeo3q00mK76om1I';
const stripePromise = loadStripe(stripePublishableKey);

interface CheckoutFormProps {
    amount: number;
    onSuccess: () => void;
    onError: (error: string) => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ amount, onSuccess, onError }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsProcessing(true);
        setErrorMessage(null);

        try {
            const { error } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/payment-success`,
                },
                redirect: 'if_required',
            });

            if (error) {
                setErrorMessage(error.message || 'Payment failed');
                onError(error.message || 'Payment failed');
            } else {
                onSuccess();
            }
        } catch (err: any) {
            setErrorMessage(err.message);
            onError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <PaymentElement
                options={{
                    layout: 'tabs',
                }}
            />

            {errorMessage && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
                    {errorMessage}
                </div>
            )}

            <button
                type="submit"
                disabled={!stripe || isProcessing}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isProcessing ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Processing...
                    </>
                ) : (
                    <>Pay ${(amount / 100).toFixed(2)} to Escrow</>
                )}
            </button>
        </form>
    );
};

interface StripeCardFormProps {
    clientSecret: string;
    amount: number;
    onSuccess: () => void;
    onError: (error: string) => void;
}

const StripeCardForm: React.FC<StripeCardFormProps> = ({
    clientSecret,
    amount,
    onSuccess,
    onError
}) => {
    const options = {
        clientSecret,
        appearance: {
            theme: 'stripe' as const,
            variables: {
                colorPrimary: '#3b82f6',
                colorBackground: '#ffffff',
                colorText: '#1f2937',
                colorDanger: '#ef4444',
                fontFamily: 'Inter, system-ui, sans-serif',
                borderRadius: '8px',
            },
        },
    };

    return (
        <Elements stripe={stripePromise} options={options}>
            <CheckoutForm
                amount={amount}
                onSuccess={onSuccess}
                onError={onError}
            />
        </Elements>
    );
};

export default StripeCardForm;
