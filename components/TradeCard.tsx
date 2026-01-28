import React, { useState, useEffect } from 'react';
import { Trade, User, Item, TradeStatus } from '../types.ts';
import { formatCurrencyOptional, formatCurrency } from '../utils/currency.ts';
import { DisputeStatusCard } from './DisputeStatusCard.tsx';
import { ShippingLabelModal } from './ShippingLabelModal.tsx';

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
    isNew?: boolean;
    onMarkSeen?: (tradeId: string) => void;
    children?: React.ReactNode;
}

// Helper to manage seen trades in localStorage
// We store tradeId:updatedAt to detect counteroffers (updatedAt changes on counter)
const SEEN_TRADES_KEY = 'leverage_seen_trades';
const SESSION_SEEN_KEY = 'leverage_session_seen_trades'; // Session storage for current view

export const getSeenTrades = (): Set<string> => {
    try {
        const stored = localStorage.getItem(SEEN_TRADES_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
        return new Set();
    }
};

// Get trades seen in this session (persists across page refreshes within same tab)
const getSessionSeenTrades = (): Set<string> => {
    try {
        const stored = sessionStorage.getItem(SESSION_SEEN_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
        return new Set();
    }
};

// Generate a unique key for a trade version (includes updatedAt to detect counteroffers)
export const getTradeVersionKey = (tradeId: string, updatedAt: string): string => {
    return `${tradeId}:${updatedAt}`;
};

export const markTradeAsSeen = (tradeId: string, updatedAt: string): void => {
    try {
        const key = getTradeVersionKey(tradeId, updatedAt);

        // Mark in localStorage (persists forever)
        const seen = getSeenTrades();
        seen.add(key);
        const arr = Array.from(seen).slice(-500);
        localStorage.setItem(SEEN_TRADES_KEY, JSON.stringify(arr));

        // Also mark in sessionStorage (so we don't glow again on same page)
        const sessionSeen = getSessionSeenTrades();
        sessionSeen.add(key);
        sessionStorage.setItem(SESSION_SEEN_KEY, JSON.stringify(Array.from(sessionSeen)));
    } catch {
        // Ignore storage errors
    }
};

// Trade is "new" if it wasn't seen in localStorage before this session started
// (trades marked "seen" during this session were genuinely new and should glow once)
export const isTradeNew = (tradeId: string, updatedAt: string): boolean => {
    const key = getTradeVersionKey(tradeId, updatedAt);
    const inLocalStorage = getSeenTrades().has(key);
    const inSessionStorage = getSessionSeenTrades().has(key);

    // If it's in sessionStorage, we already showed the glow this session - don't show again
    if (inSessionStorage) return false;

    // If it's NOT in localStorage, it's genuinely new and should glow
    if (!inLocalStorage) return true;

    // If it's in localStorage but not sessionStorage, it was seen in a previous session
    // Don't show glow for old seen trades
    return false;
};

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


const TradeCard: React.FC<TradeCardProps> = ({ trade, currentUser, otherUser, allItems, trackingData, escrowInfo, onOpenDisputeResponse, isNew = false, onMarkSeen, children }) => {
    const wasProposer = trade.proposerId === currentUser.id;
    const [showShippingModal, setShowShippingModal] = useState(false);
    const [showNewGlow, setShowNewGlow] = useState(isNew);

    // Mark trade as seen after first render and fade out glow
    useEffect(() => {
        if (isNew) {
            // Mark as seen immediately (using updatedAt so counteroffers show as new)
            markTradeAsSeen(trade.id, trade.updatedAt);
            onMarkSeen?.(trade.id);

            // Keep the glow visible for 3 seconds then fade out
            const timer = setTimeout(() => {
                setShowNewGlow(false);
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [trade.id, trade.updatedAt, isNew, onMarkSeen]);

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

    const CashPill: React.FC<{ amount: number; label?: string }> = ({ amount, label = 'Cash' }) => (
        <div className="group/pill flex items-center gap-2 bg-emerald-50/90 dark:bg-emerald-900/40 backdrop-blur-sm rounded-xl pl-1 pr-3 py-1.5 shadow-sm border border-emerald-200/60 dark:border-emerald-700/50 hover:shadow-md hover:scale-[1.02] transition-all duration-200">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-inner">$</div>
            <div className="flex flex-col">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 leading-tight">{label}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{formatCurrency(amount)}</span>
            </div>
        </div>
    );

    // Calculate value ratio for visual bar - show as "your contribution" vs "their contribution"
    const totalValue = youGiveTotal + youGetTotal;
    // When you give more, you contribute more to the trade
    const yourContributionPercent = totalValue > 0 ? (youGiveTotal / totalValue) * 100 : 50;
    const theirContributionPercent = totalValue > 0 ? (youGetTotal / totalValue) * 100 : 50;

    // Calculate the cash contribution needed to balance - this appears as a sub-item
    const cashContributionNeeded = valueDiff < 0 ? Math.abs(valueDiff) : 0;

    // Determine if this is a "winning" trade for celebration effects
    const isWinning = valueDiff > 50; // More than $50 in your favor triggers celebration

    return (
        <div className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50/50 via-white to-emerald-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-900 border-2 shadow-lg hover:shadow-2xl transition-all duration-300 ${showNewGlow ? 'border-sky-400 dark:border-sky-500 ring-4 ring-sky-400/40 dark:ring-sky-500/30 animate-pulse-glow' : 'border-amber-200/60 dark:border-gray-700/60'}`}>
            {/* NEW badge for unseen trades */}
            {showNewGlow && (
                <div className="absolute top-4 left-4 z-20">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-gradient-to-r from-sky-400 to-blue-500 text-white shadow-lg shadow-sky-400/40 animate-bounce-subtle">
                        <span className="text-sm">✨</span>
                        NEW
                    </span>
                </div>
            )}


            {/* Floating decorations - illustrated assets */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Floating stars */}
                <img
                    src="/assets/trade-card/sparkle-star.png"
                    alt=""
                    className="absolute top-6 left-6 w-8 h-8 opacity-70"
                />
                <img
                    src="/assets/trade-card/sparkle-star-alt.png"
                    alt=""
                    className="absolute top-16 left-14 w-5 h-5 opacity-50"
                />
                <img
                    src="/assets/trade-card/sparkle-star.png"
                    alt=""
                    className="absolute bottom-28 left-4 w-6 h-6 opacity-40"
                />

                {/* Floating coins */}
                <img
                    src="/assets/trade-card/gold-coin.png"
                    alt=""
                    className="absolute top-10 right-10 w-10 h-10 opacity-80"
                />
                <img
                    src="/assets/trade-card/gold-coin.png"
                    alt=""
                    className="absolute top-24 right-20 w-7 h-7 opacity-60"
                />
                <img
                    src="/assets/trade-card/money-bag.png"
                    alt=""
                    className="absolute bottom-36 right-6 w-8 h-8 opacity-50"
                />

                {/* Confetti/celebration when winning */}
                {isWinning && (
                    <>
                        <img
                            src="/assets/trade-card/confetti-burst.png"
                            alt=""
                            className="absolute top-0 right-0 w-32 h-32 opacity-60"
                        />
                        <img
                            src="/assets/trade-card/party-popper.png"
                            alt=""
                            className="absolute top-4 right-40 w-12 h-12 opacity-70 rotate-12"
                        />
                        <img
                            src="/assets/trade-card/party-popper.png"
                            alt=""
                            className="absolute bottom-32 right-12 w-10 h-10 opacity-50 -rotate-12"
                        />
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
                {trade.status === TradeStatus.COUNTERED && (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold rounded-full bg-orange-400 text-orange-900 shadow-lg shadow-orange-400/30 border-2 border-orange-500">
                        <span className="text-base">🔄</span>
                        Countered
                    </span>
                )}
            </div>

            <div className="relative p-6">
                {/* Avatar header */}
                <div className="flex items-center justify-center gap-6 mb-6">
                    {/* Your avatar */}
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl ring-4 ring-white dark:ring-gray-700 border-2 border-sky-300 overflow-hidden">
                            {currentUser.profilePictureUrl ? (
                                <img src={currentUser.profilePictureUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                            ) : (
                                currentUser.name.charAt(0).toUpperCase()
                            )}
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
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl ring-4 ring-white dark:ring-gray-700 border-2 border-orange-300 overflow-hidden">
                            {otherUser.profilePictureUrl ? (
                                <img src={otherUser.profilePictureUrl} alt={otherUser.name} className="w-full h-full object-cover" />
                            ) : (
                                otherUser.name.charAt(0).toUpperCase()
                            )}
                        </div>
                        <span className="mt-2 text-sm font-bold text-gray-700 dark:text-white">{otherUser.name}</span>
                    </div>
                </div>

                {/* Trade panels - colorful with decorative elements */}
                <div className="grid grid-cols-2 gap-4">
                    {/* SENDING panel - pink/red theme */}
                    <div className="relative">
                        <div className="absolute -top-3 left-4 z-10 flex items-center">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-lg border-2 border-rose-400">
                                <span className="text-sm">↑</span>
                                SENDING
                                <span className="inline-flex items-center justify-center w-5 h-5 bg-white/20 rounded-full text-[10px]">
                                    {youGiveItems.length + (youGiveCash > 0 ? 1 : 0)}
                                </span>
                            </span>
                            {/* Arrow extending from badge */}
                            <div className="flex items-center -ml-1">
                                <div className="w-8 h-0.5 bg-rose-400" />
                                <svg className="w-3 h-3 text-rose-400 -ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                                </svg>
                            </div>
                        </div>
                        <div className="relative pt-5 p-4 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-50 dark:from-rose-900/30 dark:to-pink-900/20 border-2 border-rose-300/60 dark:border-rose-700/40 min-h-[120px]">
                            {/* Decorative stars in corner */}
                            <img src="/assets/trade-card/sparkle-star-alt.png" alt="" className="absolute top-2 right-2 w-5 h-5 opacity-50" />
                            <img src="/assets/trade-card/sparkle-star.png" alt="" className="absolute bottom-6 right-4 w-6 h-6 opacity-40" />

                            <div className="flex flex-wrap gap-2">
                                {youGiveItems.map(item => <ItemPill key={item.id} item={item} />)}
                                {youGiveCash > 0 && <CashPill amount={youGiveCash} />}
                                {youGiveItems.length === 0 && youGiveCash === 0 && cashContributionNeeded === 0 && (
                                    <div className="w-full flex flex-col items-center justify-center py-6 text-gray-400">
                                        <span className="text-2xl mb-1">📭</span>
                                        <span className="text-xs font-medium">Nothing to send</span>
                                    </div>
                                )}
                            </div>
                            {/* Cash contribution sub-item when you're adding money to balance */}
                            {cashContributionNeeded > 0 && (
                                <div className="mt-2 pt-2 border-t border-rose-200/60 border-dashed">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 bg-amber-50/90 backdrop-blur-sm rounded-xl pl-1 pr-3 py-1.5 shadow-sm border border-amber-200/60">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-inner">+$</div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-amber-800 leading-tight">Your Cash</span>
                                                <span className="text-[10px] text-amber-600">{formatCurrency(cashContributionNeeded)}</span>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-rose-500 italic">to balance trade</span>
                                    </div>
                                </div>
                            )}
                            <div className="mt-3 pt-2 border-t border-rose-300/40 flex justify-between items-center">
                                <span className="text-[11px] uppercase tracking-wider text-rose-500 font-bold">Total Value</span>
                                <span className="text-base font-bold text-rose-600 dark:text-rose-400">{formatCurrency(youGiveTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* RECEIVING panel - green theme with confetti if winning */}
                    <div className="relative">
                        <div className="absolute -top-3 left-4 z-10 flex items-center">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold rounded-full shadow-lg border-2 border-emerald-400">
                                <span className="text-sm">↓</span>
                                RECEIVING
                                <span className="inline-flex items-center justify-center w-5 h-5 bg-white/20 rounded-full text-[10px]">
                                    {youGetItems.length + (youGetCash > 0 ? 1 : 0)}
                                </span>
                            </span>
                            {/* Arrow extending from badge */}
                            <div className="flex items-center -ml-1">
                                <div className="w-8 h-0.5 bg-emerald-400" />
                                <svg className="w-3 h-3 text-emerald-400 -ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z" />
                                </svg>
                            </div>
                        </div>
                        <div className="relative pt-5 p-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/20 border-2 border-emerald-300/60 dark:border-emerald-700/40 min-h-[120px]">
                            {/* Confetti decorations when winning */}
                            {isWinning && (
                                <>
                                    <img src="/assets/trade-card/confetti-burst.png" alt="" className="absolute -top-2 -right-2 w-16 h-16 opacity-70" />
                                    <img src="/assets/trade-card/party-popper.png" alt="" className="absolute top-1 right-12 w-8 h-8 opacity-60 rotate-12" />
                                    <img src="/assets/trade-card/sparkle-star.png" alt="" className="absolute bottom-10 right-2 w-6 h-6 opacity-50" />
                                </>
                            )}
                            <img src="/assets/trade-card/sparkle-star-alt.png" alt="" className="absolute top-2 right-2 w-5 h-5 opacity-50" />
                            <img src="/assets/trade-card/gold-coin.png" alt="" className="absolute bottom-6 right-4 w-6 h-6 opacity-40" />

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
                    <div className="mt-5">
                        {/* Bar container with treasure chests */}
                        <div className="relative flex items-center px-8">
                            {/* Left treasure chest - outside the bar */}
                            <img
                                src="/assets/trade-card/treasure-chest.png"
                                alt=""
                                className="absolute left-0 w-12 h-12 z-10 object-contain"
                            />

                            {/* The actual progress bar - rose = your contribution, green = their contribution */}
                            <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                                <div
                                    className="bg-gradient-to-r from-rose-400 via-rose-500 to-rose-400 transition-all duration-500"
                                    style={{ width: `${yourContributionPercent}%` }}
                                />
                                <div
                                    className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 transition-all duration-500"
                                    style={{ width: `${theirContributionPercent}%` }}
                                />
                            </div>

                            {/* Right treasure chest - outside the bar */}
                            <img
                                src="/assets/trade-card/treasure-chest.png"
                                alt=""
                                className="absolute right-0 w-12 h-12 z-10 object-contain"
                            />
                        </div>

                        {/* Value difference message - celebratory style */}
                        <div className={`mt-3 py-3 px-5 rounded-2xl text-center font-bold flex items-center justify-center gap-3 ${valueDiff > 0
                            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30'
                            : valueDiff < 0
                                ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-amber-900 shadow-lg shadow-amber-400/30'
                                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                            <img
                                src={valueDiff > 0 ? '/assets/trade-card/money-bag.png' : valueDiff < 0 ? '/assets/trade-card/gold-coin.png' : '/assets/trade-card/sparkle-star.png'}
                                alt=""
                                className="w-10 h-10 object-contain flex-shrink-0"
                            />
                            <span className="text-base">
                                {valueDiff > 0
                                    ? `+${formatCurrency(valueDiff)} in your favor!`
                                    : valueDiff < 0
                                        ? `You're adding ${formatCurrency(Math.abs(valueDiff))} to balance`
                                        : 'Perfectly balanced trade'
                                }
                            </span>
                            {valueDiff > 0 && (
                                <img src="/assets/trade-card/party-popper.png" alt="" className="w-10 h-10 object-contain flex-shrink-0" />
                            )}
                        </div>
                    </div>
                )}

                {/* Counter-offer indicator */}
                {trade.parentTradeId && (
                    <div className="mt-4 flex justify-center">
                        <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-xl border border-orange-200 dark:border-orange-700">
                            <span className="text-lg">🔄</span>
                            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Counter-Offer</span>
                        </span>
                    </div>
                )}

                {/* Counter message */}
                {trade.counterMessage && (
                    <div className="mt-3 mx-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
                        <p className="text-sm text-amber-800 dark:text-amber-200 italic">"{trade.counterMessage}"</p>
                    </div>
                )}

                {/* Timestamp */}
                <div className="mt-4 text-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {trade.parentTradeId
                            ? (wasProposer ? 'You counter-offered' : `${otherUser.name} counter-offered`)
                            : (wasProposer ? 'You proposed' : `${otherUser.name} proposed`)
                        } • {new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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

            {/* Shipping CTA - show when escrow funded but not shipped yet */}
            {trade.status === TradeStatus.ESCROW_FUNDED && !yourTracking && (
                <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl border-2 border-indigo-200 dark:border-indigo-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">📦</span>
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white">Ready to Ship!</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    Funds secured. Buy a shipping label to send your items to {otherUser.name}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowShippingModal(true)}
                            className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:scale-[1.02] transition-all duration-200"
                        >
                            🏷️ Buy Label
                        </button>
                    </div>
                </div>
            )}

            {/* Already shipped indicator */}
            {trade.status === TradeStatus.ESCROW_FUNDED && yourTracking && !theirTracking && (
                <div className="mx-6 mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">✅</span>
                        <div>
                            <p className="font-semibold text-blue-800 dark:text-blue-200">You've shipped!</p>
                            <p className="text-sm text-blue-600 dark:text-blue-300">
                                Waiting for {otherUser.name} to ship their items...
                            </p>
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

            {/* Shipping Label Modal */}
            <ShippingLabelModal
                isOpen={showShippingModal}
                onClose={() => setShowShippingModal(false)}
                tradeId={trade.id}
                userId={typeof currentUser.id === 'string' ? parseInt(currentUser.id, 10) : currentUser.id}
                recipientName={otherUser.name}
                itemCategory={youGiveItems[0]?.category}
            />
        </div>
    );
};

export default TradeCard;