/**
 * Payout History Section
 * Shows user's payout history and pending payouts
 * Styled to match the dark theme of the profile page
 */

import React, { useState, useEffect } from 'react';

interface Payout {
    id: string;
    tradeId: string;
    amountCents: number;
    status: 'pending' | 'pending_onboarding' | 'processing' | 'completed' | 'failed';
    provider: string;
    providerReference: string | null;
    errorMessage: string | null;
    retryCount: number;
    createdAt: string;
    completedAt: string | null;
}

interface PayoutSummary {
    totalPendingCents: number;
    totalCompletedCents: number;
    totalFailedCents: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
}

interface PayoutHistorySectionProps {
    userId: string | number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' },
    pending_onboarding: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Setup Required' },
    processing: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Processing' },
    completed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Completed' },
    failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
};

function formatCurrency(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function PayoutHistorySection({ userId }: PayoutHistorySectionProps) {
    const [payouts, setPayouts] = useState<Payout[]>([]);
    const [summary, setSummary] = useState<PayoutSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retrying, setRetrying] = useState<string | null>(null);

    const loadPayouts = async () => {
        try {
            setLoading(true);
            const response = await fetch(`http://localhost:4000/api/users/${userId}/payouts`);
            if (!response.ok) throw new Error('Failed to load payouts');
            const data = await response.json();
            setPayouts(data.payouts);
            setSummary(data.summary);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPayouts();
    }, [userId]);

    const handleRetry = async (payoutId: string) => {
        try {
            setRetrying(payoutId);
            const response = await fetch(`http://localhost:4000/api/payouts/${payoutId}/retry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json();

            if (!response.ok) {
                alert(data.message || data.error || 'Retry failed');
            } else {
                alert('Payout completed successfully!');
            }

            await loadPayouts();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setRetrying(null);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800 p-6">
                <p className="text-red-600 dark:text-red-400">Error loading payouts: {error}</p>
                <button
                    onClick={loadPayouts}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    const hasPendingOnboarding = payouts.some(p => p.status === 'pending_onboarding');

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header - matches PaymentMethods styling */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Payouts
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Earnings from your completed trades</p>
                    </div>
                    {summary && summary.totalPendingCents > 0 && (
                        <div className="text-right">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                            <p className="text-lg font-bold text-amber-500">
                                {formatCurrency(summary.totalPendingCents)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Onboarding Alert - subtle styling */}
            {hasPendingOnboarding && (
                <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">💳</span>
                        <div className="flex-1">
                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                <span className="font-medium">Setup required</span> — Complete Stripe Connect to receive payouts
                            </p>
                        </div>
                        <a
                            href="/profile?tab=payments"
                            className="px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
                        >
                            Set Up
                        </a>
                    </div>
                </div>
            )}

            {/* Summary Stats - inline, subtle */}
            {summary && (payouts.length > 0 || summary.totalCompletedCents > 0) && (
                <div className="flex items-center gap-6 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div>
                        <p className="text-2xl font-bold text-green-500">
                            {formatCurrency(summary.totalCompletedCents)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total Earned</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
                    <div>
                        <p className="text-2xl font-bold text-amber-500">
                            {formatCurrency(summary.totalPendingCents)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700"></div>
                    <div>
                        <p className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                            {summary.completedCount + summary.pendingCount}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                    </div>
                </div>
            )}

            {/* Payout List */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {payouts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <span className="text-3xl block mb-2">💰</span>
                        <p>No payouts yet</p>
                        <p className="text-sm mt-1 text-gray-400 dark:text-gray-500">Complete trades to start earning</p>
                    </div>
                ) : (
                    payouts.map((payout) => {
                        const statusStyle = STATUS_STYLES[payout.status] || STATUS_STYLES.pending;
                        const canRetry = ['failed', 'pending_onboarding'].includes(payout.status);

                        return (
                            <div key={payout.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(payout.amountCents)}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                                {statusStyle.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {payout.tradeId.startsWith('chain_') ? 'Chain Trade' : 'Trade'}: {payout.tradeId.substring(0, 18)}...
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            {formatDate(payout.createdAt)}
                                            {payout.completedAt && ` • Completed ${formatDate(payout.completedAt)}`}
                                        </p>
                                        {payout.errorMessage && payout.status !== 'pending_onboarding' && (
                                            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                                                {payout.errorMessage}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {payout.status === 'completed' && (
                                            <span className="text-green-500 text-lg">✓</span>
                                        )}
                                        {canRetry && (
                                            <button
                                                onClick={() => handleRetry(payout.id)}
                                                disabled={retrying === payout.id}
                                                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {retrying === payout.id ? 'Retrying...' : 'Retry'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            {payouts.length > 0 && (
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 text-center">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        Payouts via Stripe Connect • Funds arrive in 1-2 business days
                    </p>
                </div>
            )}
        </div>
    );
}

export default PayoutHistorySection;
