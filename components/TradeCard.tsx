import React from 'react';
import { Trade, User, Item, TradeStatus } from '../types.ts';
import { formatCurrencyOptional, formatCurrency } from '../utils/currency.ts';

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

interface TradeCardProps {
    trade: Trade;
    currentUser: User;
    otherUser: User;
    allItems: Map<string, Item>;
    trackingData?: TradeTrackingData;
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


const TradeCard: React.FC<TradeCardProps> = ({ trade, currentUser, otherUser, allItems, trackingData, children }) => {
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

    const OfferColumn: React.FC<{ title: string, items: Item[], cash: number }> = ({ title, items, cash }) => (
        <div className="flex-1">
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">{title}</h4>
            <div className="space-y-2">
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
                    <p className="font-semibold text-gray-800 dark:text-white">Trade with {otherUser.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {wasProposer ? "You proposed" : `${otherUser.name} proposed`} on {new Date(trade.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Escrow status badge */}
                    {trade.status === TradeStatus.ESCROW_FUNDED && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                            💰 Escrow Funded
                        </span>
                    )}
                    {trade.status === TradeStatus.PAYMENT_PENDING && (
                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            ⏳ Payment Pending
                        </span>
                    )}
                    <div className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadgeClass(trade.status)}`}>
                        {trade.status.replace(/_/g, ' ')}
                    </div>
                </div>
            </div>

            <div className="flex gap-4 p-3 bg-white rounded border">
                <OfferColumn title="You Give" items={youGiveItems} cash={youGiveCash} />
                <div className="border-l border-gray-200"></div>
                <OfferColumn title="You Get" items={youGetItems} cash={youGetCash} />
            </div>

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

            {children && (
                <div className="mt-3 flex justify-end">
                    {children}
                </div>
            )}
        </div>
    );
};

export default TradeCard;