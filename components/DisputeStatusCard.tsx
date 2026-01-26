/**
 * Dispute Status Card Component
 * Shows dispute status and timeline for trades in dispute
 */

import React, { useState, useEffect } from 'react';

interface DisputeDetails {
    id: string;
    trade_id: string;
    initiator_id: number;
    respondent_id: number;
    dispute_type: string;
    status: string;
    initiator_statement: string;
    respondent_statement: string | null;
    resolution: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

interface DisputeStatusCardProps {
    disputeId: string;
    currentUserId: number;
    onRespond?: () => void;
}

const DISPUTE_STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
    'OPEN_AWAITING_RESPONSE': { label: 'Awaiting Response', color: 'text-yellow-600 bg-yellow-100', icon: '⏳' },
    'UNDER_REVIEW': { label: 'Under Review', color: 'text-blue-600 bg-blue-100', icon: '🔍' },
    'PENDING_MEDIATION': { label: 'Pending Mediation', color: 'text-purple-600 bg-purple-100', icon: '⚖️' },
    'RESOLVED': { label: 'Resolved', color: 'text-green-600 bg-green-100', icon: '✅' },
    'CLOSED': { label: 'Closed', color: 'text-gray-600 bg-gray-100', icon: '🔒' },
};

const DISPUTE_TYPE_LABELS: Record<string, string> = {
    'INR': 'Item Not Received',
    'SNAD': 'Significantly Not As Described',
    'COUNTERFEIT': 'Counterfeit Item',
    'SHIPPING_DAMAGE': 'Shipping Damage',
};

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function DisputeStatusCard({ disputeId, currentUserId, onRespond }: DisputeStatusCardProps) {
    const [dispute, setDispute] = useState<DisputeDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadDispute() {
            try {
                setLoading(true);
                const response = await fetch(`http://localhost:4000/api/disputes/${disputeId}`);
                if (!response.ok) throw new Error('Failed to load dispute');
                const data = await response.json();
                setDispute(data);
                setError(null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        if (disputeId) {
            loadDispute();
        }
    }, [disputeId]);

    if (loading) {
        return (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="animate-pulse">
                    <div className="h-5 bg-orange-200 dark:bg-orange-800 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-orange-200 dark:bg-orange-800 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    if (error || !dispute) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-600 dark:text-red-400 text-sm">Error loading dispute: {error}</p>
            </div>
        );
    }

    const statusInfo = DISPUTE_STATUS_LABELS[dispute.status] || { label: dispute.status, color: 'text-gray-600 bg-gray-100', icon: '❓' };
    const isInitiator = dispute.initiator_id === currentUserId;
    const isRespondent = dispute.respondent_id === currentUserId;
    const canRespond = isRespondent && dispute.status === 'OPEN_AWAITING_RESPONSE' && !dispute.respondent_statement;

    // Build timeline events
    const timelineEvents = [
        {
            label: 'Dispute Opened',
            date: dispute.created_at,
            icon: '⚠️',
            detail: `${DISPUTE_TYPE_LABELS[dispute.dispute_type] || dispute.dispute_type}`,
        },
    ];

    if (dispute.respondent_statement) {
        timelineEvents.push({
            label: 'Response Submitted',
            date: dispute.updated_at,
            icon: '💬',
            detail: 'Respondent provided their side',
        });
    }

    if (dispute.resolution) {
        timelineEvents.push({
            label: 'Resolved',
            date: dispute.resolved_at || dispute.updated_at,
            icon: '✅',
            detail: dispute.resolution,
        });
    }

    return (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-orange-200 dark:border-orange-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{statusInfo.icon}</span>
                    <div>
                        <h4 className="font-semibold text-orange-800 dark:text-orange-300">Dispute Active</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                            {statusInfo.label}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400">ID: {dispute.id.substring(0, 15)}...</p>
            </div>

            {/* Timeline */}
            <div className="px-4 py-3">
                <div className="space-y-3">
                    {timelineEvents.map((event, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-800 flex items-center justify-center text-sm">
                                {event.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{event.label}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{event.detail}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(event.date)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Initiator's Statement */}
            <div className="px-4 py-3 border-t border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-black/20">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {isInitiator ? 'Your claim' : "Initiator's claim"}:
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                    "{dispute.initiator_statement}"
                </p>
            </div>

            {/* Respondent's Statement */}
            {dispute.respondent_statement && (
                <div className="px-4 py-3 border-t border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-black/20">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {isRespondent ? 'Your response' : "Respondent's response"}:
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                        "{dispute.respondent_statement}"
                    </p>
                </div>
            )}

            {/* Resolution */}
            {dispute.resolution && (
                <div className="px-4 py-3 border-t border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Resolution:</p>
                    <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                        {dispute.resolution}
                    </p>
                </div>
            )}

            {/* Action Button */}
            {canRespond && onRespond && (
                <div className="px-4 py-3 border-t border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-black/20">
                    <button
                        onClick={onRespond}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        Respond to Dispute
                    </button>
                </div>
            )}
        </div>
    );
}

export default DisputeStatusCard;
