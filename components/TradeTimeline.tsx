import React, { useState, useEffect } from 'react';
import { fetchTradeEvents, TradeEventData } from '../api/api';
import { Item, TradeEventType } from '../types';
import { formatCurrency } from '../utils/currency';

interface TradeTimelineProps {
    tradeId: string;
    allItems: Map<string, Item>;
    currentUserId: string;
}

const getEventTypeConfig = (eventType: TradeEventType) => {
    switch (eventType) {
        case 'PROPOSED':
            return { icon: '📤', color: 'bg-blue-500', label: 'Trade Proposed', bgLight: 'bg-blue-50 dark:bg-blue-900/20' };
        case 'COUNTER_OFFER':
            return { icon: '🔄', color: 'bg-amber-500', label: 'Counter Offer', bgLight: 'bg-amber-50 dark:bg-amber-900/20' };
        case 'ACCEPTED':
            return { icon: '✅', color: 'bg-green-500', label: 'Accepted', bgLight: 'bg-green-50 dark:bg-green-900/20' };
        case 'REJECTED':
            return { icon: '❌', color: 'bg-red-500', label: 'Rejected', bgLight: 'bg-red-50 dark:bg-red-900/20' };
        case 'CANCELLED':
            return { icon: '🚫', color: 'bg-gray-500', label: 'Cancelled', bgLight: 'bg-gray-50 dark:bg-gray-800/50' };
        case 'PAYMENT_FUNDED':
            return { icon: '💰', color: 'bg-emerald-500', label: 'Payment Funded', bgLight: 'bg-emerald-50 dark:bg-emerald-900/20' };
        case 'SHIPPED':
            return { icon: '📦', color: 'bg-indigo-500', label: 'Shipped', bgLight: 'bg-indigo-50 dark:bg-indigo-900/20' };
        case 'DELIVERED':
            return { icon: '🏠', color: 'bg-teal-500', label: 'Delivered', bgLight: 'bg-teal-50 dark:bg-teal-900/20' };
        case 'COMPLETED':
            return { icon: '🎉', color: 'bg-purple-500', label: 'Completed', bgLight: 'bg-purple-50 dark:bg-purple-900/20' };
        case 'DISPUTE_OPENED':
            return { icon: '⚠️', color: 'bg-orange-500', label: 'Dispute Opened', bgLight: 'bg-orange-50 dark:bg-orange-900/20' };
        case 'DISPUTE_RESOLVED':
            return { icon: '⚖️', color: 'bg-slate-500', label: 'Dispute Resolved', bgLight: 'bg-slate-50 dark:bg-slate-800/50' };
        default:
            return { icon: '📋', color: 'bg-gray-400', label: eventType, bgLight: 'bg-gray-50 dark:bg-gray-800/50' };
    }
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const TradeTimeline: React.FC<TradeTimelineProps> = ({ tradeId, allItems, currentUserId }) => {
    const [events, setEvents] = useState<TradeEventData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

    useEffect(() => {
        const loadEvents = async () => {
            try {
                setIsLoading(true);
                const data = await fetchTradeEvents(tradeId);
                setEvents(data);
            } catch (err) {
                setError('Failed to load trade history');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadEvents();
    }, [tradeId]);

    if (isLoading) {
        return (
            <div className="p-4 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                <span className="ml-2 text-gray-500 dark:text-gray-400 text-sm">Loading timeline...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 text-center text-red-500 text-sm">
                {error}
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                No history available for this trade.
            </div>
        );
    }

    return (
        <div className="py-4">
            <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>

                <div className="space-y-4">
                    {events.map((event, index) => {
                        const config = getEventTypeConfig(event.eventType);
                        const isExpanded = expandedEvent === event.id;
                        const hasOfferDetails = event.proposerItemIds.length > 0 || event.receiverItemIds.length > 0 ||
                            (event.proposerCash && event.proposerCash > 0) || (event.receiverCash && event.receiverCash > 0);

                        return (
                            <div key={event.id} className="relative pl-10">
                                {/* Timeline node */}
                                <div className={`absolute left-2 w-5 h-5 rounded-full ${config.color} flex items-center justify-center text-white text-xs shadow-sm`}>
                                    <span className="text-xs">{config.icon}</span>
                                </div>

                                {/* Event card */}
                                <div className={`${config.bgLight} rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200`}>
                                    <div
                                        className="p-3 cursor-pointer hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors"
                                        onClick={() => hasOfferDetails && setExpandedEvent(isExpanded ? null : event.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.color} text-white`}>
                                                    {config.label}
                                                </span>
                                                <span className="text-sm text-gray-600 dark:text-gray-300">
                                                    by <span className="font-medium">{event.actorName}</span>
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                                    {formatDate(event.createdAt)}
                                                </span>
                                                {hasOfferDetails && (
                                                    <svg
                                                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                )}
                                            </div>
                                        </div>

                                        {event.message && (
                                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                                                "{event.message}"
                                            </p>
                                        )}
                                    </div>

                                    {/* Expanded offer details */}
                                    {isExpanded && hasOfferDetails && (
                                        <div className="px-3 pb-3 pt-0 border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/30">
                                            <div className="mt-3 grid grid-cols-2 gap-4">
                                                {/* Proposer offering */}
                                                <div>
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Proposer Offering:</p>
                                                    <div className="space-y-1">
                                                        {event.proposerItemIds.map(itemId => {
                                                            const item = allItems.get(itemId);
                                                            return (
                                                                <div key={itemId} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                                    <span className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
                                                                    {item?.name || `Item ${itemId}`}
                                                                </div>
                                                            );
                                                        })}
                                                        {event.proposerCash && event.proposerCash > 0 && (
                                                            <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                                                                + {formatCurrency(event.proposerCash)}
                                                            </div>
                                                        )}
                                                        {event.proposerItemIds.length === 0 && (!event.proposerCash || event.proposerCash === 0) && (
                                                            <div className="text-sm text-gray-400 italic">Nothing</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Receiver offering */}
                                                <div>
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Receiver Offering:</p>
                                                    <div className="space-y-1">
                                                        {event.receiverItemIds.map(itemId => {
                                                            const item = allItems.get(itemId);
                                                            return (
                                                                <div key={itemId} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                                    <span className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0" />
                                                                    {item?.name || `Item ${itemId}`}
                                                                </div>
                                                            );
                                                        })}
                                                        {event.receiverCash && event.receiverCash > 0 && (
                                                            <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                                                                + {formatCurrency(event.receiverCash)}
                                                            </div>
                                                        )}
                                                        {event.receiverItemIds.length === 0 && (!event.receiverCash || event.receiverCash === 0) && (
                                                            <div className="text-sm text-gray-400 italic">Nothing</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TradeTimeline;
