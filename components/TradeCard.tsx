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

    return (
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-lg transition-all duration-300">
            {/* Decorative background elements */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/5 to-transparent rounded-full -mr-16 -mt-16" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-500/5 to-transparent rounded-full -ml-12 -mb-12" />

            {/* Status ribbon */}
            <div className="absolute top-3 right-3 z-10">
                {trade.status === TradeStatus.PENDING_ACCEPTANCE && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                        ⏳ {wasProposer ? `Waiting for ${otherUser.name}` : 'Awaiting your response'}
                    </span>
                )}
                {trade.status === TradeStatus.ESCROW_FUNDED && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
                        💰 Funds Secured
                    </span>
                )}
                {trade.status === TradeStatus.COMPLETED && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 border border-green-200 shadow-sm">
                        ✅ Complete
                    </span>
                )}
                {trade.status === TradeStatus.REJECTED && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 border border-red-200 shadow-sm">
                        ❌ Declined
                    </span>
                )}
                {trade.status === TradeStatus.SHIPPING_PENDING && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">
                        📦 Ship Items
                    </span>
                )}
                {trade.status === TradeStatus.IN_TRANSIT && (
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">
                        🚚 In Transit
                    </span>
                )}
            </div>

            <div className="relative p-5">
                {/* Header with avatars and swap visualization */}
                <div className="flex items-center justify-center gap-4 mb-5">
                    {/* Your side */}
                    <div className="flex flex-col items-center">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shadow-lg ring-4 ring-white dark:ring-gray-800">
                            {currentUser.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="mt-2 text-sm font-semibold text-gray-800 dark:text-white">You</span>
                    </div>

                    {/* Swap icon with animation */}
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </div>
                        {/* Animated rings */}
                        <div className="absolute inset-0 rounded-full border-2 border-purple-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                    </div>

                    {/* Their side */}
                    <div className="flex flex-col items-center">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-lg font-bold shadow-lg ring-4 ring-white dark:ring-gray-800">
                            {otherUser.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="mt-2 text-sm font-semibold text-gray-800 dark:text-white">{otherUser.name}</span>
                    </div>
                </div>

                {/* Trade flow visualization */}
                <div className="grid grid-cols-2 gap-3">
                    {/* You Give */}
                    <div className="relative">
                        <div className="absolute -top-2 left-3 px-2 py-0.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] font-bold rounded-full shadow-sm z-10 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                            SENDING
                            {(youGiveItems.length + (youGiveCash > 0 ? 1 : 0)) > 0 && (
                                <span className="bg-white/30 px-1.5 rounded-full text-[9px]">{youGiveItems.length + (youGiveCash > 0 ? 1 : 0)}</span>
                            )}
                        </div>
                        <div className="pt-4 p-3 rounded-xl bg-gradient-to-br from-rose-50/80 to-orange-50/80 dark:from-rose-900/20 dark:to-orange-900/20 border border-rose-200/50 dark:border-rose-700/30 min-h-[110px] hover:border-rose-300 dark:hover:border-rose-600 transition-colors">
                            <div className="flex flex-wrap gap-2">
                                {youGiveItems.map(item => <ItemPill key={item.id} item={item} />)}
                                {youGiveCash > 0 && <CashPill amount={youGiveCash} />}
                                {youGiveItems.length === 0 && youGiveCash === 0 && (
                                    <div className="w-full flex flex-col items-center justify-center py-4 text-gray-400">
                                        <svg className="w-8 h-8 mb-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                        <span className="text-xs italic">Nothing to send</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-rose-200/50 dark:border-rose-700/30 flex justify-between items-center">
                                <span className="text-[10px] uppercase tracking-wider text-rose-400 dark:text-rose-500 font-medium">Total Value</span>
                                <span className="text-sm font-bold text-rose-700 dark:text-rose-300">{formatCurrency(youGiveTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* You Get */}
                    <div className="relative">
                        <div className="absolute -top-2 left-3 px-2 py-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-bold rounded-full shadow-sm z-10 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                            RECEIVING
                            {(youGetItems.length + (youGetCash > 0 ? 1 : 0)) > 0 && (
                                <span className="bg-white/30 px-1.5 rounded-full text-[9px]">{youGetItems.length + (youGetCash > 0 ? 1 : 0)}</span>
                            )}
                        </div>
                        <div className="pt-4 p-3 rounded-xl bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200/50 dark:border-emerald-700/30 min-h-[110px] hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors">
                            <div className="flex flex-wrap gap-2">
                                {youGetItems.map(item => <ItemPill key={item.id} item={item} />)}
                                {youGetCash > 0 && <CashPill amount={youGetCash} />}
                                {youGetItems.length === 0 && youGetCash === 0 && (
                                    <div className="w-full flex flex-col items-center justify-center py-4 text-gray-400">
                                        <svg className="w-8 h-8 mb-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" /></svg>
                                        <span className="text-xs italic">Nothing to receive</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 pt-2 border-t border-emerald-200/50 dark:border-emerald-700/30 flex justify-between items-center">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-400 dark:text-emerald-500 font-medium">Total Value</span>
                                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(youGetTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Visual value balance bar */}
                {totalValue > 0 && (
                    <div className="mt-4 space-y-2">
                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                            <div
                                className="bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500"
                                style={{ width: `${givePercent}%` }}
                            />
                            <div
                                className="bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                style={{ width: `${getPercent}%` }}
                            />
                        </div>
                        <div className={`text-center py-1.5 px-4 rounded-lg text-xs font-semibold ${valueDiff > 0
                                ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : valueDiff < 0
                                    ? 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-gray-100/80 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400'
                            }`}>
                            {valueDiff > 0
                                ? `📈 +${formatCurrency(valueDiff)} in your favor`
                                : valueDiff < 0
                                    ? `📉 ${formatCurrency(Math.abs(valueDiff))} extra from you`
                                    : '⚖️ Perfectly balanced'
                            }
                        </div>
                    </div>
                )}

                {/* Timestamp */}
                <div className="mt-3 text-center">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
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