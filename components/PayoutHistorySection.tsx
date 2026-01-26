/**
 * Payout History Section
 * Shows user's payout history and pending payouts
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

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
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
    pending_onboarding: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Setup Required' },
    processing: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Processing' },
    completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
    failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
                <p className="text-red-600">Error loading payouts: {error}</p>
                <button
                    onClick={loadPayouts}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    const hasPendingOnboarding = payouts.some(p => p.status === 'pending_onboarding');

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            💰 Payouts
                        </h3>
                        <p className="text-sm text-gray-600">Earnings from your completed trades</p>
                    </div>
                    {summary && summary.totalPendingCents > 0 && (
                        <div className="text-right">
                            <p className="text-xs text-gray-500">Pending</p>
                            <p className="text-lg font-bold text-yellow-600">
                                {formatCurrency(summary.totalPendingCents)}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Onboarding Alert */}
            {hasPendingOnboarding && (
                <div className="mx-6 mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div className="flex-1">
                            <h4 className="font-medium text-orange-800">Setup Required to Receive Payouts</h4>
                            <p className="text-sm text-orange-700 mt-1">
                                You have pending payouts waiting! Complete your Stripe Connect setup to receive funds directly to your bank account.
                            </p>
                            <a
                                href="/profile?tab=payments"
                                className="inline-block mt-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                            >
                                Set Up Payouts →
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            {summary && (payouts.length > 0 || summary.totalCompletedCents > 0) && (
                <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-100">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                        <p className="text-2xl font-bold text-green-600">
                            {formatCurrency(summary.totalCompletedCents)}
                        </p>
                        <p className="text-xs text-gray-600">Total Earned</p>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                        <p className="text-2xl font-bold text-yellow-600">
                            {formatCurrency(summary.totalPendingCents)}
                        </p>
                        <p className="text-xs text-gray-600">Pending</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-gray-600">
                            {summary.completedCount}
                        </p>
                        <p className="text-xs text-gray-600">Payouts</p>
                    </div>
                </div>
            )}

            {/* Payout List */}
            <div className="divide-y divide-gray-100">
                {payouts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <span className="text-4xl block mb-2">📭</span>
                        <p>No payouts yet</p>
                        <p className="text-sm mt-1">Complete trades to start earning!</p>
                    </div>
                ) : (
                    payouts.map((payout) => {
                        const statusStyle = STATUS_STYLES[payout.status] || STATUS_STYLES.pending;
                        const canRetry = ['failed', 'pending_onboarding'].includes(payout.status);

                        return (
                            <div key={payout.id} className="p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900">
                                                {formatCurrency(payout.amountCents)}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                                {statusStyle.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Trade: {payout.tradeId.substring(0, 20)}...
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatDate(payout.createdAt)}
                                            {payout.completedAt && ` • Completed ${formatDate(payout.completedAt)}`}
                                        </p>
                                        {payout.errorMessage && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {payout.errorMessage}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {payout.status === 'completed' && (
                                            <span className="text-green-500 text-xl">✓</span>
                                        )}
                                        {canRetry && (
                                            <button
                                                onClick={() => handleRetry(payout.id)}
                                                disabled={retrying === payout.id}
                                                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-500">
                        Payouts are processed via Stripe Connect. Funds typically arrive in 1-2 business days.
                    </p>
                </div>
            )}
        </div>
    );
}

export default PayoutHistorySection;
