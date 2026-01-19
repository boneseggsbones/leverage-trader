/**
 * Trade Journey Timeline
 * A modern, intuitive visualization of the user's trade-up journey
 * Shows progression from initial items to current holdings with value gains
 */

import React, { useMemo, useState } from 'react';
import { Trade, Item } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface TradeJourneyTimelineProps {
    trades: Trade[];
    userId: string;
    allItems: Map<string, Item>;
    onTradeClick?: (tradeId: string) => void;
}

interface JourneyStep {
    type: 'start' | 'trade' | 'current';
    trade?: Trade;
    itemsGiven?: Item[];
    itemsReceived?: Item[];
    cashGiven?: number;
    cashReceived?: number;
    netChange?: number;
    runningTotal?: number;
    date?: string;
}

const TradeJourneyTimeline: React.FC<TradeJourneyTimelineProps> = ({
    trades,
    userId,
    allItems,
    onTradeClick,
}) => {
    const [hoveredStep, setHoveredStep] = useState<number | null>(null);

    // Calculate journey steps
    const journeySteps = useMemo(() => {
        if (!trades.length) return [];

        // Sort trades by date
        const sortedTrades = [...trades].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        let runningTotal = 0;
        const steps: JourneyStep[] = [];

        // Start step
        steps.push({ type: 'start' });

        // Trade steps
        sortedTrades.forEach((trade) => {
            const wasProposer = String(trade.proposerId) === String(userId);
            const givenIds = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
            const receivedIds = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
            const cashGiven = wasProposer ? trade.proposerCash : trade.receiverCash;
            const cashReceived = wasProposer ? trade.receiverCash : trade.proposerCash;

            const itemsGiven = givenIds.map((id) => allItems.get(String(id))).filter(Boolean) as Item[];
            const itemsReceived = receivedIds.map((id) => allItems.get(String(id))).filter(Boolean) as Item[];

            const valueGiven = itemsGiven.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0) + (cashGiven || 0);
            const valueReceived = itemsReceived.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0) + (cashReceived || 0);
            const netChange = valueReceived - valueGiven;
            runningTotal += netChange;

            steps.push({
                type: 'trade',
                trade,
                itemsGiven,
                itemsReceived,
                cashGiven,
                cashReceived,
                netChange,
                runningTotal,
                date: trade.createdAt,
            });
        });

        // Current step
        steps.push({ type: 'current', runningTotal });

        return steps;
    }, [trades, userId, allItems]);

    const totalNetGain = journeySteps.length > 0
        ? journeySteps[journeySteps.length - 1].runningTotal || 0
        : 0;

    if (!trades.length) {
        return (
            <div className="text-center py-12">
                <div className="text-6xl mb-4">🚀</div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                    Start Your Journey
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    Complete your first trade and watch your trade-up journey unfold here!
                </p>
            </div>
        );
    }

    return (
        <div className="trade-journey-timeline">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{trades.length}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trades</p>
                </div>
                <div className={`text-center p-4 rounded-xl ${totalNetGain >= 0
                        ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20'
                        : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20'
                    }`}>
                    <p className={`text-2xl font-bold ${totalNetGain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {totalNetGain >= 0 ? '+' : ''}{formatCurrency(totalNetGain)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Net Gain</p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {trades.length > 0 ? Math.round((trades.filter(t => {
                            const wasProposer = String(t.proposerId) === String(userId);
                            const givenIds = wasProposer ? t.proposerItemIds : t.receiverItemIds;
                            const receivedIds = wasProposer ? t.receiverItemIds : t.proposerItemIds;
                            const cashGiven = wasProposer ? t.proposerCash : t.receiverCash;
                            const cashReceived = wasProposer ? t.receiverCash : t.proposerCash;
                            const valueGiven = givenIds.reduce((sum, id) => sum + (allItems.get(String(id))?.estimatedMarketValue || 0), 0) + (cashGiven || 0);
                            const valueReceived = receivedIds.reduce((sum, id) => sum + (allItems.get(String(id))?.estimatedMarketValue || 0), 0) + (cashReceived || 0);
                            return valueReceived > valueGiven;
                        }).length / trades.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Win Rate</p>
                </div>
            </div>

            {/* Timeline */}
            <div className="relative">
                {/* Connecting Line */}
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500 rounded-full" />

                {/* Steps */}
                <div className="space-y-4">
                    {journeySteps.map((step, index) => (
                        <div
                            key={index}
                            className={`relative pl-14 transition-all duration-300 ${hoveredStep === index ? 'scale-[1.02]' : ''
                                }`}
                            onMouseEnter={() => setHoveredStep(index)}
                            onMouseLeave={() => setHoveredStep(null)}
                        >
                            {/* Node */}
                            <div className={`absolute left-0 w-12 h-12 rounded-full flex items-center justify-center z-10 transition-all duration-300 ${step.type === 'start'
                                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                                    : step.type === 'current'
                                        ? 'bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30 animate-pulse'
                                        : step.netChange && step.netChange >= 0
                                            ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30'
                                            : 'bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-lg shadow-red-500/30'
                                }`}>
                                {step.type === 'start' && <span className="text-lg">🎯</span>}
                                {step.type === 'current' && <span className="text-lg">⭐</span>}
                                {step.type === 'trade' && (
                                    <span className="text-sm font-bold">
                                        {step.netChange && step.netChange >= 0 ? '↗' : '↘'}
                                    </span>
                                )}
                            </div>

                            {/* Card */}
                            {step.type === 'start' ? (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                                    <p className="font-semibold text-blue-700 dark:text-blue-300">Journey Started</p>
                                    <p className="text-sm text-blue-600/70 dark:text-blue-400/70">
                                        Your first trade began the adventure
                                    </p>
                                </div>
                            ) : step.type === 'current' ? (
                                <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                                    <p className="font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                                        Current Status
                                        <span className="text-xs bg-purple-200 dark:bg-purple-800 px-2 py-0.5 rounded-full">Today</span>
                                    </p>
                                    <p className={`text-lg font-bold mt-1 ${(step.runningTotal || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                        }`}>
                                        Total: {(step.runningTotal || 0) >= 0 ? '+' : ''}{formatCurrency(step.runningTotal || 0)}
                                    </p>
                                </div>
                            ) : (
                                <div
                                    className={`bg-white dark:bg-gray-800 border rounded-xl p-4 cursor-pointer hover:shadow-lg transition-shadow ${step.netChange && step.netChange >= 0
                                            ? 'border-green-200 dark:border-green-800/50 hover:border-green-300'
                                            : 'border-red-200 dark:border-red-800/50 hover:border-red-300'
                                        }`}
                                    onClick={() => step.trade && onTradeClick?.(step.trade.id)}
                                >
                                    {/* Trade Header */}
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {step.date ? new Date(step.date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            }) : ''}
                                        </span>
                                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${step.netChange && step.netChange >= 0
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                            }`}>
                                            {step.netChange && step.netChange >= 0 ? '+' : ''}{formatCurrency(step.netChange || 0)}
                                        </span>
                                    </div>

                                    {/* Trade Flow */}
                                    <div className="flex items-center gap-3">
                                        {/* Given */}
                                        <div className="flex-1">
                                            <p className="text-xs text-gray-400 mb-1">Traded Away</p>
                                            <div className="flex gap-1 flex-wrap">
                                                {step.itemsGiven?.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                                        {item.imageUrl ? (
                                                            <img
                                                                src={item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl}
                                                                alt={item.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">📦</div>
                                                        )}
                                                    </div>
                                                ))}
                                                {(step.itemsGiven?.length || 0) > 3 && (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs text-gray-500">
                                                        +{(step.itemsGiven?.length || 0) - 3}
                                                    </div>
                                                )}
                                                {step.cashGiven && step.cashGiven > 0 && (
                                                    <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-xs">💵</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Arrow */}
                                        <div className="text-2xl text-gray-300 dark:text-gray-600">→</div>

                                        {/* Received */}
                                        <div className="flex-1">
                                            <p className="text-xs text-gray-400 mb-1">Received</p>
                                            <div className="flex gap-1 flex-wrap">
                                                {step.itemsReceived?.slice(0, 3).map((item, i) => (
                                                    <div key={i} className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden ring-2 ring-green-400 dark:ring-green-600">
                                                        {item.imageUrl ? (
                                                            <img
                                                                src={item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl}
                                                                alt={item.name}
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">📦</div>
                                                        )}
                                                    </div>
                                                ))}
                                                {(step.itemsReceived?.length || 0) > 3 && (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs text-gray-500">
                                                        +{(step.itemsReceived?.length || 0) - 3}
                                                    </div>
                                                )}
                                                {step.cashReceived && step.cashReceived > 0 && (
                                                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-xs ring-2 ring-green-400">💵</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Running Total */}
                                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Running Total</span>
                                        <span className={`font-medium ${(step.runningTotal || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                            }`}>
                                            {(step.runningTotal || 0) >= 0 ? '+' : ''}{formatCurrency(step.runningTotal || 0)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TradeJourneyTimeline;
