import React from 'react';
import { Trade, User, Item, TradeStatus } from '../types.ts';
import { formatCurrencyOptional, formatCurrency } from '../utils/currency.ts';
import { DisputeStatusCard } from './DisputeStatusCard.tsx';

// Tracking info from the API
export interface TrackingDisplayInfo {
    trackingNumber: string;
    carrier: string;
    status: string;
    statusDetail: string | null;
    location: string | null;
    estimatedDelivery: string | null;
    deliveredAt: string | null;
}

export interface TradeTrackingData {
    proposer: TrackingDisplayInfo | null;
    receiver: TrackingDisplayInfo | null;
}

// Escrow transaction info
export interface EscrowDisplayInfo {
    id: string;
    amount: number;
    status: string;
    provider: string;
    fundedAt: string | null;
    releasedAt?: string | null;
}

interface TradeCardProps {
    trade: Trade;
    currentUser: User;
    otherUser: User;
    allItems: Map<string, Item>;
    trackingData?: TradeTrackingData;
    escrowInfo?: EscrowDisplayInfo | null;
    onOpenDisputeResponse?: () => void;
    children?: React.ReactNode;
}

const getStatusBadgeClass = (status: TradeStatus) => {
    switch (status) {
        case TradeStatus.PENDING_ACCEPTANCE: return 'bg-yellow-100 text-yellow-800';
        case TradeStatus.REJECTED: return 'bg-red-100 text-red-800';
        case TradeStatus.CANCELLED: return 'bg-gray-100 text-gray-800';
        case TradeStatus.COMPLETED:
        case TradeStatus.COMPLETED_AWAITING_RATING:
            return 'bg-green-100 text-green-800';
        default: return 'bg-blue-100 text-blue-800';
    }
}

const CompactItem: React.FC<{ item: Item }> = ({ item }) => {
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;

    return (
        <div className="flex items-center gap-2">
            <img src={imageUrl} alt={item.name} className="w-8 h-8 rounded object-cover border dark:border-gray-600" />
            <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 leading-tight">{item.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
            </div>
        </div>
    );
};

const CompactCash: React.FC<{ amount: number }> = ({ amount }) => (
    <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center font-bold text-green-700 text-sm border">$</div>
        <div>
            <p className="text-xs font-semibold text-gray-700 leading-tight">Cash</p>
            <p className="text-xs text-gray-500">{formatCurrency(amount)}</p>
        </div>
    </div>
);

// Shipping status icons and colors
const getTrackingStatusStyle = (status: string) => {
    switch (status) {
        case 'DELIVERED': return { icon: '✅', bg: 'bg-green-100', text: 'text-green-800' };
        case 'OUT_FOR_DELIVERY': return { icon: '🚚', bg: 'bg-blue-100', text: 'text-blue-800' };
        case 'IN_TRANSIT': return { icon: '📦', bg: 'bg-blue-100', text: 'text-blue-800' };
        case 'PICKED_UP': return { icon: '📤', bg: 'bg-yellow-100', text: 'text-yellow-800' };
        case 'LABEL_CREATED': return { icon: '🏷️', bg: 'bg-gray-100', text: 'text-gray-800' };
        default: return { icon: '📋', bg: 'bg-gray-100', text: 'text-gray-800' };
    }
};

// Compact shipping tracker display
const ShippingTracker: React.FC<{ tracking: TrackingDisplayInfo; label: string }> = ({ tracking, label }) => {
    const style = getTrackingStatusStyle(tracking.status);

    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${style.bg}`}>
            <span className="text-lg">{style.icon}</span>
            <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${style.text}`}>{label}</p>
                <p className="text-xs text-gray-600 truncate">
                    {tracking.carrier} • {tracking.trackingNumber.slice(0, 10)}...
                </p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                {tracking.status.replace(/_/g, ' ')}
            </span>
        </div>
    );
};


const TradeCard: React.FC<TradeCardProps> = ({ trade, currentUser, otherUser, allItems, trackingData, escrowInfo, onOpenDisputeResponse, children }) => {
    const wasProposer = trade.proposerId === currentUser.id;

    const youGiveItemIds = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
    const youGiveCash = wasProposer ? trade.proposerCash : trade.receiverCash;

    const youGetItemIds = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
    const youGetCash = wasProposer ? trade.receiverCash : trade.proposerCash;

    const youGiveItems = youGiveItemIds.map(id => allItems.get(id)).filter(Boolean) as Item[];
    const youGetItems = youGetItemIds.map(id => allItems.get(id)).filter(Boolean) as Item[];

    // Get your tracking and their tracking based on who you are
    const yourTracking = wasProposer ? trackingData?.proposer : trackingData?.receiver;
    const theirTracking = wasProposer ? trackingData?.receiver : trackingData?.proposer;

    // Calculate total values for each side
    const youGiveTotal = youGiveItems.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0) + youGiveCash;
    const youGetTotal = youGetItems.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0) + youGetCash;
    const valueDiff = youGetTotal - youGiveTotal;

    // Get first item image for preview or use placeholder
    const getFirstItemImage = (items: Item[]) => {
        if (items.length === 0) return null;
        const img = items[0].imageUrl;
        return img && img.startsWith('/') ? `http://localhost:4000${img}` : img;
    };

    const youGivePreview = getFirstItemImage(youGiveItems);
    const youGetPreview = getFirstItemImage(youGetItems);

    // Item pill component with enhanced display
    const ItemPill: React.FC<{ item: Item }> = ({ item }) => {
        const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;
        return (
            <div
                className="group/pill flex items-center gap-2 bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm rounded-xl pl-1 pr-3 py-1.5 shadow-sm border border-gray-200/60 dark:border-gray-600/60 hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-default"
                title={`${item.name} - ${formatCurrencyOptional(item.estimatedMarketValue ?? null)}`}
            >
                <img src={imageUrl} alt={item.name} className="w-8 h-8 rounded-lg object-cover ring-1 ring-gray-200/50 dark:ring-gray-600/50" />
                <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[90px] leading-tight">{item.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</span>
                </div>
            </div>
        );
    };

    const CashPill: React.FC<{ amount: number }> = ({ amount }) => (
        <div className="group/pill flex items-center gap-2 bg-emerald-50/90 dark:bg-emerald-900/40 backdrop-blur-sm rounded-xl pl-1 pr-3 py-1.5 shadow-sm border border-emerald-200/60 dark:border-emerald-700/50 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-inner">$</div>
            <div className="flex flex-col">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 leading-tight">Cash</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{formatCurrency(amount)}</span>
            </div>
        </div>
    );

    // Calculate value ratio for visual bar
    const totalValue = youGiveTotal + youGetTotal;
    const givePercent = totalValue > 0 ? (youGiveTotal / totalValue) * 100 : 50;
    const getPercent = totalValue > 0 ? (youGetTotal / totalValue) * 100 : 50;

    // Determine if this is a "winning" trade for celebration effects
    const isWinning = valueDiff > 50; // More than $50 in your favor triggers celebration

    return (
        <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50/50 via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 border-2 border-amber-200/60 dark:border-gray-700/60 shadow-lg hover:shadow-2xl transition-all duration-300">

            {/* Floating decorations - stars, coins, sparkles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Stars */}
                <span className="absolute top-8 left-8 text-amber-400/60 text-lg animate-pulse">⭐</span>
                <span className="absolute top-20 left-16 text-amber-300/40 text-sm" style={{ animationDelay: '0.5s' }}>✦</span>
                <span className="absolute bottom-32 left-6 text-purple-400/40 text-base">✧</span>

                {/* Floating coins */}
                <span className="absolute top-12 right-12 text-xl animate-bounce" style={{ animationDuration: '2s' }}>🪙</span>
                <span className="absolute top-28 right-24 text-lg animate-bounce" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }}>🪙</span>
                <span className="absolute bottom-48 right-8 text-base animate-bounce" style={{ animationDuration: '3s', animationDelay: '0.6s' }}>💰</span>

                {/* Confetti when winning */}
                {isWinning && (
                    <>
                        <span className="absolute top-16 right-32 text-red-500/70 text-lg animate-pulse">🎊</span>
                        <span className="absolute top-8 right-48 text-blue-500/60 rotate-12 text-sm">🎉</span>
                        <span className="absolute bottom-40 right-16 text-green-500/50 text-base">🎉</span>
                        <div className="absolute top-24 right-20 w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                        <div className="absolute top-32 right-12 w-1.5 h-1.5 bg-pink-400 rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
                        <div className="absolute top-16 right-36 w-2 h-2 bg-blue-400 rounded-full animate-ping" style={{ animationDelay: '0.4s' }} />
                    </>
                )}
            </div>

            {/* Status badge - pill style with icon */}
            <div className="absolute top-4 right-4 z-10">
                {trade.status === TradeStatus.PENDING_ACCEPTANCE && (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-full bg-amber-400 text-amber-900 shadow-lg shadow-amber-400/30 border-2 border-amber-500">
                        <span className="text-base">⏰</span>
                        {wasProposer ? `Waiting for ${otherUser.name}` : 'Awaiting your response'}
                    </span>
                )}
                {trade.status === TradeStatus.ESCROW_FUNDED && (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-full bg-emerald-400 text-emerald-900 shadow-lg shadow-emerald-400/30 border-2 border-emerald-500">
                        <span className="text-base">💰</span>
                        Funds Secured
                    </span>
                )}
                {trade.status === TradeStatus.COMPLETED && (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-full bg-green-400 text-green-900 shadow-lg shadow-green-400/30 border-2 border-green-500">
                        <span className="text-base">✅</span>
                        Complete
                    </span>
                )}
            </div>

            <div className="relative p-6">
                {/* Avatar header with illustrated style */}
                <div className="flex items-center justify-center gap-6 mb-6">
                    {/* Your avatar */}
                    <div className="flex flex-col items-center">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl ring-4 ring-white dark:ring-gray-700 border-2 border-sky-300">
                                {currentUser.name.charAt(0).toUpperCase()}
                            </div>
                            {/* Decorative ring */}
                            <div className="absolute -inset-1 rounded-full border-2 border-dashed border-sky-300/50 animate-spin" style={{ animationDuration: '10s' }} />
                        </div>
                        <span className="mt-2 text-sm font-bold text-gray-700 dark:text-white">You</span>
                    </div>

                    {/* Swap arrow - playful curved arrow */}
                    <div className="relative flex items-center">
                        <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 40 40" fill="none">
                            <path d="M8 20 Q 20 8, 32 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" className="drop-shadow-sm" />
                            <path d="M28 14 L32 20 L26 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                        {/* Circular refresh arrows behind */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-30">
                            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none">
                                <path d="M4 12a8 8 0 018-8m8 8a8 8 0 01-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                    </div>

                    {/* Their avatar */}
                    <div className="flex flex-col items-center">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl ring-4 ring-white dark:ring-gray-700 border-2 border-orange-300">
                                {otherUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute -inset-1 rounded-full border-2 border-dashed border-orange-300/50 animate-spin" style={{ animationDuration: '10s', animationDirection: 'reverse' }} />
                        </div>
                        <span className="mt-2 text-sm font-bold text-gray-700 dark:text-white">{otherUser.name}</span>
                    </div>
                </div>

                {/* Trade panels - colorful with decorative elements */}
                <div className="grid grid-cols-2 gap-4">
                    {/* SENDING panel - pink/red theme */}
                    <div className="relative">
                        <div className="absolute -top-3 left-4 z-10">
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg border-2 border-rose-400">
                                <span className="text-sm">↑</span>
                                SENDING
                            </span>
                        </div>
                        <div className="relative pt-5 p-4 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-50 dark:from-rose-900/30 dark:to-pink-900/20 border-2 border-rose-300/60 dark:border-rose-700/40 min-h-[120px]">
                            {/* Decorative stars in corner */}
                            <span className="absolute top-3 right-3 text-rose-300/60 text-xs">✦</span>
                            <span className="absolute bottom-8 right-6 text-amber-300/50 text-sm">⭐</span>

                            <div className="flex flex-wrap gap-2">
                                {youGiveItems.map(item => <ItemPill key={item.id} item={item} />)}
                                {youGiveCash > 0 && <CashPill amount={youGiveCash} />}
                                {youGiveItems.length === 0 && youGiveCash === 0 && (
                                    <div className="w-full flex flex-col items-center justify-center py-6 text-gray-400">
                                        <span className="text-2xl mb-1">📭</span>
                                        <span className="text-xs font-medium">Nothing to send</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-rose-300/40 flex justify-between items-center">
                                <span className="text-[11px] uppercase tracking-wider text-rose-500 font-bold">Total Value</span>
                                <span className="text-base font-bold text-rose-600 dark:text-rose-400">{formatCurrency(youGiveTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* RECEIVING panel - green theme with confetti if winning */}
                    <div className="relative">
                        <div className="absolute -top-3 left-4 z-10">
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold rounded-full shadow-lg border-2 border-emerald-400">
                                <span className="text-sm">↓</span>
                                RECEIVING
                            </span>
                        </div>
                        <div className="relative pt-5 p-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/20 border-2 border-emerald-300/60 dark:border-emerald-700/40 min-h-[120px]">
                            {/* Confetti decorations when winning */}
                            {isWinning && (
                                <>
                                    <span className="absolute top-2 right-2 text-lg">🎊</span>
                                    <span className="absolute top-4 right-8 text-sm rotate-12">🎉</span>
                                    <span className="absolute bottom-12 right-4 text-base">✨</span>
                                </>
                            )}
                            <span className="absolute top-3 right-3 text-emerald-300/60 text-xs">✦</span>
                            <span className="absolute bottom-8 right-6 text-amber-300/50 text-sm">💰</span>

                            <div className="flex flex-wrap gap-2">
                                {youGetItems.map(item => <ItemPill key={item.id} item={item} />)}
                                {youGetCash > 0 && <CashPill amount={youGetCash} />}
                                {youGetItems.length === 0 && youGetCash === 0 && (
                                    <div className="w-full flex flex-col items-center justify-center py-6 text-gray-400">
                                        <span className="text-2xl mb-1">📭</span>
                                        <span className="text-xs font-medium">Nothing to receive</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-emerald-300/40 flex justify-between items-center">
                                <span className="text-[11px] uppercase tracking-wider text-emerald-500 font-bold">Total Value</span>
                                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(youGetTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Value balance bar - treasure chest style */}
                {totalValue > 0 && (
                    <div className="mt-5 relative">
                        {/* Treasure chest decorations on the bar */}
                        <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 relative">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 text-lg z-10">📦</div>
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-lg z-10">📦</div>
                            <div
                                className="bg-gradient-to-r from-rose-400 via-rose-500 to-rose-400 transition-all duration-500 flex items-center justify-center"
                                style={{ width: `${givePercent}%` }}
                            />
                            <div
                                className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 transition-all duration-500"
                                style={{ width: `${getPercent}%` }}
                            />
                        </div>

                        {/* Value difference message - celebratory style */}
                        <div className={`mt-3 py-3 px-5 rounded-2xl text-center font-bold flex items-center justify-center gap-2 ${valueDiff > 0
                            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30'
                            : valueDiff < 0
                                ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-amber-900 shadow-lg shadow-amber-400/30'
                                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                            <span className="text-xl">
                                {valueDiff > 0 ? '💰' : valueDiff < 0 ? '📉' : '⚖️'}
                            </span>
                            <span className="text-base">
                                {valueDiff > 0
                                    ? `+${formatCurrency(valueDiff)} in your favor! Winning!`
                                    : valueDiff < 0
                                        ? `${formatCurrency(Math.abs(valueDiff))} extra from you`
                                        : 'Perfectly balanced trade'
                                }
                            </span>
                            {valueDiff > 0 && <span className="text-xl">🎉</span>}
                        </div>
                    </div>
                )}

                {/* Timestamp */}
                <div className="mt-4 text-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {wasProposer ? 'You proposed' : `${otherUser.name} proposed`} • {new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                </div>
            </div>

            {/* Escrow transaction info */}
            {escrowInfo && (
                <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🔒</span>
                        <h4 className="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">Escrow Details</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Amount Secured</span>
                            <p className="font-medium text-gray-800 dark:text-white">{formatCurrency(escrowInfo.amount)}</p>
                        </div>
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Status</span>
                            <p className="font-medium text-gray-800 dark:text-white">{escrowInfo.status}</p>
                        </div>
                        {escrowInfo.fundedAt && (
                            <div>
                                <span className="text-gray-500 dark:text-gray-400">Funded</span>
                                <p className="font-medium text-gray-800 dark:text-white">
                                    {new Date(escrowInfo.fundedAt).toLocaleString()}
                                </p>
                            </div>
                        )}
                        <div>
                            <span className="text-gray-500 dark:text-gray-400">Transaction ID</span>
                            <p className="font-medium text-gray-800 dark:text-white font-mono text-xs">{escrowInfo.id.slice(-8)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Shipping tracking section */}
            {(yourTracking || theirTracking) && (
                <div className="mt-3 space-y-2">
                    {yourTracking && (
                        <ShippingTracker tracking={yourTracking} label="Your Shipment" />
                    )}
                    {theirTracking && (
                        <ShippingTracker tracking={theirTracking} label={`${otherUser.name}'s Shipment`} />
                    )}
                </div>
            )}

            {/* Dispute Status Card */}
            {trade.status === TradeStatus.DISPUTE_OPENED && trade.disputeTicketId && (
                <div className="mt-3">
                    <DisputeStatusCard
                        disputeId={trade.disputeTicketId}
                        currentUserId={typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : currentUser.id}
                        onRespond={onOpenDisputeResponse}
                    />
                </div>
            )}

            {children && (
                <div className="mt-3 flex justify-end">
                    {children}
                </div>
            )}
        </div>
    );
};

export default TradeCard;