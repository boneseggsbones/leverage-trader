import React, { useState, useEffect } from 'react';
import { Trade } from '../types';
import { createPaymentIntent, fundEscrow, CashDifferential, CreatePaymentIntentResult } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import StripeCardForm from './StripeCardForm';

interface EscrowPaymentModalProps {
    trade: Trade;
    isOpen: boolean;
    onClose: () => void;
    onPaymentSuccess: () => void;
}

const EscrowPaymentModal: React.FC<EscrowPaymentModalProps> = ({
    trade,
    isOpen,
    onClose,
    onPaymentSuccess,
}) => {
    const { currentUser } = useAuth();
    const [paymentIntent, setPaymentIntent] = useState<CreatePaymentIntentResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && trade && currentUser) {
            initializePayment();
        }
    }, [isOpen, trade.id, currentUser?.id]);

    const initializePayment = async () => {
        if (!currentUser) return;

        setIsLoading(true);
        setError(null);
        setPaymentIntent(null);

        try {
            const result = await createPaymentIntent(trade.id, currentUser.id);
            setPaymentIntent(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMockPayment = async () => {
        if (!currentUser) return;

        setIsProcessing(true);
        setError(null);

        try {
            await fundEscrow(trade.id, currentUser.id);
            onPaymentSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleStripeSuccess = () => {
        onPaymentSuccess();
        onClose();
    };

    const handleStripeError = (errorMessage: string) => {
        setError(errorMessage);
    };

    if (!isOpen) return null;

    // Simple logic: if you give cash in this trade, you're the payer
    const isProposer = String(trade.proposerId) === String(currentUser?.id);
    const youGiveCash = isProposer ? trade.proposerCash : trade.receiverCash;
    const youGetCash = isProposer ? trade.receiverCash : trade.proposerCash;
    const isPayer = youGiveCash > 0;
    const cashAmount = isPayer ? youGiveCash : youGetCash;
    const isStripe = paymentIntent?.provider === 'stripe';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className={`px-6 py-4 ${isPayer ? 'bg-gradient-to-r from-blue-500 to-indigo-600' : 'bg-gradient-to-r from-green-500 to-emerald-600'} text-white`}>
                    <h2 className="text-xl font-bold">{isPayer ? '💳 Add Cash to Trade' : '🎉 You\'re Getting Paid'}</h2>
                    <p className="text-white/80 text-sm mt-1">
                        {isPayer ? 'Add cash to make this trade fair' : 'The other trader adds cash to make this fair'}
                    </p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                        </div>
                    ) : error && !paymentIntent ? (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    ) : cashAmount === 0 ? (
                        <div className="text-center py-6">
                            <div className="text-4xl mb-3">✅</div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Equal Trade</h3>
                            <p className="text-gray-600 dark:text-gray-300 mt-2">
                                No cash payment is required for this trade.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Cash Differential Summary */}
                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600 dark:text-gray-300">Amount to Add</span>
                                    <span className="text-2xl font-bold text-gray-800 dark:text-white">
                                        {formatCurrency(cashAmount)}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    This makes the trade fair for both sides.
                                </p>
                            </div>

                            {/* Payment Info */}
                            {isPayer ? (
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                                        <span className="text-xl">🔒</span>
                                        <div>
                                            <h4 className="font-medium text-gray-800 dark:text-white">Secure Escrow</h4>
                                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                                Your money is held safely until both parties confirm receipt.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Stripe Card Form or Mock Payment */}
                                    {isStripe && paymentIntent?.clientSecret ? (
                                        <div className="mt-4">
                                            <StripeCardForm
                                                clientSecret={paymentIntent.clientSecret}
                                                amount={cashAmount}
                                                onSuccess={handleStripeSuccess}
                                                onError={handleStripeError}
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleMockPayment}
                                            disabled={isProcessing}
                                            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isProcessing ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>Pay {formatCurrency(cashAmount)} to Escrow</>
                                            )}
                                        </button>
                                    )}

                                    {error && (
                                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
                                            {error}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                                    <span className="text-3xl">🎉</span>
                                    <h4 className="font-medium text-gray-800 dark:text-white mt-2">You're Getting Paid!</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                        The other trader adds {formatCurrency(cashAmount)} to make this trade fair. You'll get it once you both confirm the items arrived safely.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EscrowPaymentModal;
