import React, { useState, useEffect } from 'react';
import { Trade } from '../types';
import { fetchCashDifferential, fundEscrow, CashDifferential } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';

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
    const [differential, setDifferential] = useState<CashDifferential | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && trade) {
            loadCashDifferential();
        }
    }, [isOpen, trade.id]);

    const loadCashDifferential = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const diff = await fetchCashDifferential(trade.id);
            setDifferential(diff);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFundEscrow = async () => {
        if (!currentUser || !differential) return;

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

    if (!isOpen) return null;

    const isUserPayer = differential?.payerId === Number(currentUser?.id);
    const isPayer = differential?.payerId !== null && isUserPayer;

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
                <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                    <h2 className="text-xl font-bold">💳 Escrow Payment</h2>
                    <p className="text-blue-100 text-sm mt-1">Secure your trade with escrow protection</p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    ) : differential?.amount === 0 ? (
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
                                    <span className="text-gray-600 dark:text-gray-300">Cash Differential</span>
                                    <span className="text-2xl font-bold text-gray-800 dark:text-white">
                                        {formatCurrency(differential?.amount || 0)}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    {differential?.description}
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
                                                Your payment is held securely until both parties confirm receipt of items.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span>
                                            Funds are protected in escrow
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span>
                                            Released only after mutual confirmation
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-green-500">✓</span>
                                            Full refund if trade is cancelled
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                                    <span className="text-3xl">🎉</span>
                                    <h4 className="font-medium text-gray-800 dark:text-white mt-2">You're Receiving Payment</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                        You'll receive {formatCurrency(differential?.amount || 0)} once both parties confirm receipt.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                    {isPayer && differential && differential.amount > 0 && (
                        <button
                            onClick={handleFundEscrow}
                            disabled={isProcessing}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Pay {formatCurrency(differential.amount)} to Escrow
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EscrowPaymentModal;
