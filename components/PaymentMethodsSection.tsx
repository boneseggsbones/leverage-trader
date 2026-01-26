/**
 * Payment Methods Section
 * Manage connected payment accounts for cash portions of trades
 * Uses Stripe Elements for secure card entry
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    fetchPaymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    createSetupIntent,
    confirmPaymentMethod,
    getPaymentProvidersStatus,
    PaymentMethod,
    PaymentProvider,
    PaymentProvidersStatus
} from '../api/api';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import PlaidLinkButton from './PlaidLinkButton';

// Load Stripe outside of component
const stripePublishableKey = (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY
    || 'pk_test_51SrPsKJZxfeiuvjPAyxTDvn6WPmSBg5HYwQLUfrNyTpxyZiDtSx3ZR5MnKE6h95B35QUcLNVWKCYhZpjT8Lkeo3q00mK76om1I';
const stripePromise = loadStripe(stripePublishableKey);

interface PaymentMethodsSectionProps {
    userId: string | number;
}

const PROVIDER_INFO: Record<PaymentProvider, { name: string; icon: string; color: string; description: string }> = {
    stripe_card: {
        name: 'Credit/Debit Card',
        icon: '💳',
        color: 'bg-blue-500',
        description: 'Pay cash portions with your card'
    },
    stripe_bank: {
        name: 'Bank Account',
        icon: '🏦',
        color: 'bg-green-500',
        description: 'Receive payments directly'
    },
    venmo: {
        name: 'Venmo',
        icon: '📱',
        color: 'bg-blue-400',
        description: 'Send/receive via Venmo'
    },
    paypal: {
        name: 'PayPal',
        icon: '🅿️',
        color: 'bg-blue-600',
        description: 'Send/receive via PayPal'
    },
    coinbase: {
        name: 'Coinbase',
        icon: '₿',
        color: 'bg-orange-500',
        description: 'Crypto payments'
    }
};

// Card setup form using Stripe Elements
interface CardSetupFormProps {
    userId: string | number;
    onSuccess: (method: PaymentMethod) => void;
    onCancel: () => void;
}

const CardSetupForm: React.FC<CardSetupFormProps> = ({ userId, onSuccess, onCancel }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);

    useEffect(() => {
        // Create SetupIntent when form mounts
        const initSetup = async () => {
            try {
                const result = await createSetupIntent(userId);
                setClientSecret(result.clientSecret);
                setCustomerId(result.customerId);
            } catch (err: any) {
                setError(err.message);
            }
        };
        initSetup();
    }, [userId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements || !clientSecret || !customerId) return;

        setIsProcessing(true);
        setError(null);

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
            setError('Card element not found');
            setIsProcessing(false);
            return;
        }

        try {
            const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
                payment_method: {
                    card: cardElement,
                },
            });

            if (stripeError) {
                setError(stripeError.message || 'Card setup failed');
                setIsProcessing(false);
                return;
            }

            if (setupIntent?.payment_method) {
                // Save to our backend
                const result = await confirmPaymentMethod(
                    userId,
                    setupIntent.payment_method as string,
                    customerId
                );
                onSuccess({
                    id: result.id,
                    provider: 'stripe_card',
                    display_name: result.displayName,
                    is_default: 0,
                    is_verified: 1,
                    connected_at: new Date().toISOString(),
                    last_used_at: null,
                    last_four: result.lastFour,
                    brand: result.brand,
                });
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    if (!clientSecret) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">Setting up...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <CardElement
                    options={{
                        style: {
                            base: {
                                fontSize: '16px',
                                color: '#1f2937',
                                '::placeholder': { color: '#9ca3af' },
                            },
                        },
                        hidePostalCode: true,
                    }}
                />
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!stripe || isProcessing}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isProcessing ? 'Saving...' : 'Save Card'}
                </button>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                🔒 Secured by Stripe. Your card info is never stored on our servers.
            </p>
        </form>
    );
};

// Main component
const PaymentMethodsSection: React.FC<PaymentMethodsSectionProps> = ({ userId }) => {
    const { currentUser } = useAuth();
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [providersStatus, setProvidersStatus] = useState<PaymentProvidersStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
    const [displayName, setDisplayName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isOwnProfile = currentUser?.id?.toString() === userId.toString();

    useEffect(() => {
        loadData();
    }, [userId]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [methodsData, statusData] = await Promise.all([
                fetchPaymentMethods(userId),
                getPaymentProvidersStatus()
            ]);
            setMethods(methodsData);
            setProvidersStatus(statusData);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddNonStripe = async () => {
        if (!selectedProvider || !displayName.trim()) return;

        setIsSubmitting(true);
        try {
            const newMethod = await addPaymentMethod(
                userId,
                selectedProvider,
                displayName.trim(),
                undefined,
                methods.length === 0
            );
            setMethods([...methods, newMethod]);
            closeModal();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStripeCardSuccess = (newMethod: PaymentMethod) => {
        setMethods([...methods, newMethod]);
        closeModal();
    };

    const closeModal = () => {
        setShowAddModal(false);
        setSelectedProvider(null);
        setDisplayName('');
    };

    const handleSetDefault = async (methodId: number) => {
        try {
            await updatePaymentMethod(userId, methodId, { isDefault: true });
            setMethods(methods.map(m => ({
                ...m,
                is_default: m.id === methodId ? 1 : 0
            })));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleDelete = async (methodId: number) => {
        if (!confirm('Remove this payment method?')) return;

        try {
            await deletePaymentMethod(userId, methodId);
            setMethods(methods.filter(m => m.id !== methodId));
        } catch (err: any) {
            setError(err.message);
        }
    };

    const isProviderConfigured = (provider: PaymentProvider): boolean => {
        if (!providersStatus) return false;
        // Only stripe_card is currently fully implemented
        if (provider === 'stripe_card') {
            return providersStatus.stripe.configured;
        }
        // Bank accounts require Plaid (not yet implemented)
        if (provider === 'stripe_bank') {
            return providersStatus.plaid.configured;
        }
        if (provider === 'venmo') return providersStatus.paypal.configured;
        return providersStatus[provider as keyof PaymentProvidersStatus]?.configured || false;
    };

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Payment Methods</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Connect accounts to send and receive cash in trades
                    </p>
                </div>
                {isOwnProfile && (
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        + Add Method
                    </button>
                )}
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Connected Methods */}
            {methods.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <span className="text-4xl">💳</span>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">No payment methods connected</p>
                    {isOwnProfile && (
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                            Connect Your First Method
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {methods.map(method => {
                        const info = PROVIDER_INFO[method.provider];
                        const displayBrand = method.brand
                            ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1)
                            : '';
                        return (
                            <div
                                key={method.id}
                                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 ${info?.color || 'bg-gray-500'} rounded-xl flex items-center justify-center text-white text-xl`}>
                                        {info?.icon || '💳'}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-800 dark:text-white">
                                                {method.last_four
                                                    ? `${displayBrand} ••••${method.last_four}`
                                                    : method.display_name
                                                }
                                            </span>
                                            {method.is_default === 1 && (
                                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs rounded-full">
                                                    Default
                                                </span>
                                            )}
                                            {method.is_verified === 1 && (
                                                <span className="text-green-500 text-sm">✓ Verified</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {info?.name || method.provider} • Connected {new Date(method.connected_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                {isOwnProfile && (
                                    <div className="flex items-center gap-2">
                                        {method.is_default !== 1 && (
                                            <button
                                                onClick={() => handleSetDefault(method.id)}
                                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            >
                                                Set Default
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(method.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add Method Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                                Add Payment Method
                            </h3>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {!selectedProvider ? (
                                <>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Select a payment method to connect:
                                    </p>
                                    <div className="space-y-2">
                                        {(Object.keys(PROVIDER_INFO) as PaymentProvider[]).map(provider => {
                                            const info = PROVIDER_INFO[provider];
                                            const configured = isProviderConfigured(provider);
                                            const isComingSoon = !configured && provider !== 'stripe_card';

                                            return (
                                                <button
                                                    key={provider}
                                                    onClick={() => !isComingSoon && setSelectedProvider(provider)}
                                                    disabled={isComingSoon}
                                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-colors text-left ${isComingSoon
                                                        ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                                                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400'
                                                        }`}
                                                >
                                                    <div className={`w-10 h-10 ${info.color} rounded-lg flex items-center justify-center text-white`}>
                                                        {info.icon}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium text-gray-800 dark:text-white">{info.name}</p>
                                                            {isComingSoon && (
                                                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs rounded-full">
                                                                    Coming Soon
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">{info.description}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : selectedProvider === 'stripe_card' ? (
                                <>
                                    <button
                                        onClick={() => setSelectedProvider(null)}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        ← Back to all methods
                                    </button>

                                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                                                💳
                                            </div>
                                            <p className="font-medium text-gray-800 dark:text-white">
                                                Credit or Debit Card
                                            </p>
                                        </div>
                                    </div>

                                    <Elements stripe={stripePromise}>
                                        <CardSetupForm
                                            userId={userId}
                                            onSuccess={handleStripeCardSuccess}
                                            onCancel={closeModal}
                                        />
                                    </Elements>
                                </>
                            ) : selectedProvider === 'stripe_bank' ? (
                                <>
                                    <button
                                        onClick={() => setSelectedProvider(null)}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        ← Back to all methods
                                    </button>

                                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center text-white">
                                                🏦
                                            </div>
                                            <p className="font-medium text-gray-800 dark:text-white">
                                                Bank Account
                                            </p>
                                        </div>
                                    </div>

                                    <PlaidLinkButton
                                        userId={userId}
                                        onSuccess={(method) => {
                                            setMethods([...methods, {
                                                id: method.id,
                                                provider: method.provider as PaymentProvider,
                                                display_name: method.displayName,
                                                is_default: methods.length === 0 ? 1 : 0,
                                                is_verified: 1,
                                                connected_at: new Date().toISOString(),
                                                last_used_at: null,
                                                last_four: method.lastFour,
                                            }]);
                                            closeModal();
                                        }}
                                        onCancel={closeModal}
                                    />

                                    {/* Alternative for businesses or users who prefer not to use Plaid */}
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 text-center">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                            Are you a business or prefer not to use Plaid?
                                        </p>
                                        <button
                                            type="button"
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const btn = e.currentTarget;
                                                btn.textContent = 'Setting up...';
                                                btn.disabled = true;
                                                try {
                                                    const response = await fetch(`http://localhost:4000/api/users/${userId}/stripe-connect/onboard`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                    });
                                                    const data = await response.json();
                                                    if (data.onboardingUrl) {
                                                        window.open(data.onboardingUrl, '_blank');
                                                        btn.textContent = 'Set up with Stripe Connect →';
                                                    } else if (data.error) {
                                                        alert('Error: ' + data.error);
                                                        btn.textContent = 'Set up with Stripe Connect →';
                                                    }
                                                } catch (err: any) {
                                                    console.error('Stripe Connect error:', err);
                                                    alert('Connection error. Please try again.');
                                                    btn.textContent = 'Set up with Stripe Connect →';
                                                }
                                                btn.disabled = false;
                                            }}
                                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                        >
                                            Set up with Stripe Connect →
                                        </button>
                                    </div>
                                </>
                            ) : (
                                // Non-Stripe providers (placeholder for now)
                                <>
                                    <button
                                        onClick={() => setSelectedProvider(null)}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        ← Back to all methods
                                    </button>

                                    <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 ${PROVIDER_INFO[selectedProvider].color} rounded-lg flex items-center justify-center text-white`}>
                                                {PROVIDER_INFO[selectedProvider].icon}
                                            </div>
                                            <p className="font-medium text-gray-800 dark:text-white">
                                                {PROVIDER_INFO[selectedProvider].name}
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            {selectedProvider === 'venmo' ? 'Venmo Username'
                                                : selectedProvider === 'paypal' ? 'PayPal Email'
                                                    : selectedProvider === 'coinbase' ? 'Coinbase Email'
                                                        : 'Display Name'}
                                        </label>
                                        <input
                                            type="text"
                                            value={displayName}
                                            onChange={(e) => setDisplayName(e.target.value)}
                                            placeholder={
                                                selectedProvider === 'venmo' ? '@username'
                                                    : selectedProvider === 'paypal' ? 'email@example.com'
                                                        : selectedProvider === 'coinbase' ? 'email@example.com'
                                                            : 'Account name'
                                            }
                                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>

                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        💡 Full integration coming soon. For now, your username will be displayed to trade partners for manual transfers.
                                    </p>

                                    <button
                                        onClick={handleAddNonStripe}
                                        disabled={!displayName.trim() || isSubmitting}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                                    >
                                        {isSubmitting ? 'Connecting...' : 'Connect Method'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentMethodsSection;
