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

    const OfferColumn: React.FC<{ title: string, items: Item[], cash: number, isGiving: boolean }> = ({ title, items, cash, isGiving }) => (
        <div className="flex-1">
            <h4 className={`text-sm font-bold mb-2 ${isGiving ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{title}</h4>
            <div className={`space-y-2 p-2 rounded-lg ${isGiving ? 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800'}`}>
                {items.length === 0 && cash === 0 ? (
                    <p className="text-xs text-gray-400 italic">Nothing offered</p>
                ) : (
                    <>
                        {items.map(item => <CompactItem key={item.id} item={item} />)}
                        {cash > 0 && <CompactCash amount={cash} />}
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 transition-colors">
            <div className="flex justify-between items-start mb-3">
                <div>
                    {/* Visual direction indicator */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`font-semibold ${wasProposer ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>
                            {wasProposer ? 'You' : otherUser.name}
                        </span>
                        <span className="flex items-center text-gray-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                        </span>
                        <span className={`font-semibold ${!wasProposer ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'}`}>
                            {wasProposer ? otherUser.name : 'You'}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {wasProposer ? "You proposed" : `${otherUser.name} proposed`} on {new Date(trade.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Friendly status badges */}
                    {trade.status === TradeStatus.ESCROW_FUNDED && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                            💰 Money Secured
                        </span>
                    )}
                    {trade.status === TradeStatus.PAYMENT_PENDING && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            {youGiveCash > 0 ? '💳 You Need to Pay' : `⏳ Waiting for ${otherUser.name}`}
                        </span>
                    )}
                    {trade.status === TradeStatus.PENDING_ACCEPTANCE && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            ⏳ Waiting for Response
                        </span>
                    )}
                    {trade.status === TradeStatus.SHIPPING_PENDING && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            📦 Ready to Ship
                        </span>
                    )}
                    {trade.status === TradeStatus.IN_TRANSIT && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            🚚 On Its Way
                        </span>
                    )}
                    {trade.status === TradeStatus.DELIVERED_AWAITING_VERIFICATION && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            📬 Arrived - Check Items
                        </span>
                    )}
                    {trade.status === TradeStatus.COMPLETED && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            ✅ Done!
                        </span>
                    )}
                    {trade.status === TradeStatus.COMPLETED_AWAITING_RATING && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            ⭐ Leave a Rating
                        </span>
                    )}
                    {trade.status === TradeStatus.REJECTED && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            ❌ Declined
                        </span>
                    )}
                    {trade.status === TradeStatus.CANCELLED && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                            🚫 Cancelled
                        </span>
                    )}
                    {trade.status === TradeStatus.DISPUTE_OPENED && (
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800`}>
                            ⚠️ Issue Reported
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 p-3 bg-white dark:bg-gray-700 rounded border dark:border-gray-600">
                <OfferColumn title="You Give" items={youGiveItems} cash={youGiveCash} isGiving={true} />
                <div className="border-b sm:border-l sm:border-b-0 border-gray-200 dark:border-gray-600"></div>
                <OfferColumn title="You Get" items={youGetItems} cash={youGetCash} isGiving={false} />
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