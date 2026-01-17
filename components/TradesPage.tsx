
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import {
    fetchTradesForUser,
    fetchAllUsers,
    fetchAllItems,
    respondToTrade,
    cancelTrade,
    submitPayment,
    submitTracking,
    verifySatisfaction,
    openDispute,
    fetchTrackingStatus
} from '../api/api.ts';
import { Trade, User, Item, TradeStatus, DisputeType } from '../types.ts';
import TradeCard, { TradeTrackingData } from './TradeCard.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import DisputeModal from './DisputeModal.tsx';
import CounterOfferModal from './CounterOfferModal.tsx';

const TradesPage: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();

    const [trades, setTrades] = useState<Trade[]>([]);
    const [users, setUsers] = useState<Record<string, User>>({});
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
    const [trackingData, setTrackingData] = useState<Record<string, TradeTrackingData>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [actionTrade, setActionTrade] = useState<Trade | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | 'cancel' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadTrades = useCallback(async () => {
        if (!currentUser) {
            navigate('/login');
            return;
        }
        setIsLoading(true);
        try {
            const [userTrades, allUsers, allItemsData] = await Promise.all([
                fetchTradesForUser(currentUser.id),
                fetchAllUsers(),
                fetchAllItems(),
            ]);

            const userMap = allUsers.reduce((acc, user) => {
                acc[user.id] = user;
                return acc;
            }, {} as Record<string, User>);
            setUsers(userMap);
            setAllItems(new Map(allItemsData.map(item => [item.id, item])));

            const activeStatuses = [
                TradeStatus.PENDING_ACCEPTANCE,
                TradeStatus.ACCEPTED,
                TradeStatus.PAYMENT_PENDING,
                TradeStatus.ESCROW_FUNDED,
                TradeStatus.SHIPPING_PENDING,
                TradeStatus.IN_TRANSIT,
                TradeStatus.DELIVERED_AWAITING_VERIFICATION,
                TradeStatus.DISPUTE_OPENED,
            ];

            const activeTrades = userTrades
                .filter(t => activeStatuses.includes(t.status))
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

            setTrades(activeTrades);

            // Fetch tracking data for trades in shipping phase
            const shippingStatuses = [TradeStatus.SHIPPING_PENDING, TradeStatus.IN_TRANSIT, TradeStatus.DELIVERED_AWAITING_VERIFICATION];
            const shippingTrades = activeTrades.filter(t => shippingStatuses.includes(t.status));

            if (shippingTrades.length > 0) {
                const trackingResults = await Promise.all(
                    shippingTrades.map(async (trade) => {
                        try {
                            const data = await fetchTrackingStatus(trade.id);
                            return { tradeId: trade.id, data };
                        } catch {
                            return null;
                        }
                    })
                );

                const trackingMap: Record<string, TradeTrackingData> = {};
                trackingResults.forEach(result => {
                    if (result && result.data) {
                        trackingMap[result.tradeId] = {
                            proposer: result.data.proposer,
                            receiver: result.data.receiver
                        };
                    }
                });
                setTrackingData(trackingMap);
            }
        } catch (err) {
            // Log the real error for diagnostics (Playwright captures console)
            console.error('loadTrades error:', err);
            setError('Failed to load active trades.');
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, navigate]);

    useEffect(() => {
        loadTrades();
    }, [loadTrades]);

    const handleAction = (trade: Trade, action: 'accept' | 'reject' | 'cancel') => {
        setActionTrade(trade);
        setConfirmAction(action);
        setIsConfirmModalOpen(true);
    };

    const handleConfirm = async () => {
        if (!actionTrade || !confirmAction || !currentUser) return;
        setIsSubmitting(true);
        try {
            if (confirmAction === 'cancel') {
                await cancelTrade(actionTrade.id, currentUser.id);
            } else {
                await respondToTrade(actionTrade.id, confirmAction);
            }
            addNotification(`Trade successfully ${confirmAction === 'accept' ? 'accepted' : confirmAction}ed.`, 'success');
            await loadTrades();
        } catch (err) {
            addNotification(`Failed to ${confirmAction} trade.`, 'error');
        } finally {
            setIsConfirmModalOpen(false);
            setActionTrade(null);
            setConfirmAction(null);
            setIsSubmitting(false);
        }
    };

    const handleDisputeSubmit = async (disputeType: DisputeType, statement: string) => {
        if (!actionTrade || !currentUser) return;
        setIsSubmitting(true);
        try {
            await openDispute(actionTrade.id, currentUser.id, disputeType, statement);
            addNotification('Dispute opened successfully.', 'success');
            await loadTrades();
        } catch (err) {
            addNotification('Failed to open dispute.', 'error');
        } finally {
            setIsDisputeModalOpen(false);
            setActionTrade(null);
            setIsSubmitting(false);
        }
    };

    const handleVerifySatisfaction = async (trade: Trade) => {
        if (!currentUser) return;
        try {
            const { proposer, receiver } = await verifySatisfaction(trade.id, currentUser.id);
            if (currentUser.id === proposer.id) {
                updateUser(proposer);
            } else {
                updateUser(receiver);
            }
            addNotification('Items verified.', 'success');
            loadTrades();
        } catch (error) {
            addNotification('Failed to verify items.', 'error');
        }
    }

    const isActionRequired = (trade: Trade): boolean => {
        if (!currentUser) return false;
        const isReceiver = trade.receiverId === currentUser.id;
        const isProposer = trade.proposerId === currentUser.id;
        switch (trade.status) {
            case TradeStatus.PENDING_ACCEPTANCE: return isReceiver;
            case TradeStatus.PAYMENT_PENDING: return (isProposer && trade.proposerCash > 0) || (isReceiver && trade.receiverCash > 0);
            case TradeStatus.SHIPPING_PENDING: return !((isProposer && trade.proposerSubmittedTracking) || (isReceiver && trade.receiverSubmittedTracking));
            case TradeStatus.DELIVERED_AWAITING_VERIFICATION: return !((isProposer && trade.proposerVerifiedSatisfaction) || (isReceiver && trade.receiverVerifiedSatisfaction));
            default: return false;
        }
    };

    const renderActionButtons = (trade: Trade) => {
        if (!currentUser) return null;
        const isReceiver = trade.receiverId === currentUser.id;
        const isProposer = trade.proposerId === currentUser.id;

        switch (trade.status) {
            case TradeStatus.PENDING_ACCEPTANCE:
                if (isReceiver) return (
                    <div className="flex gap-2">
                        <button onClick={() => handleAction(trade, 'accept')} className="px-3 py-1 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 rounded">Accept</button>
                        <button onClick={() => { setActionTrade(trade); setIsCounterModalOpen(true); }} className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded">Counter</button>
                        <button onClick={() => handleAction(trade, 'reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded">Reject</button>
                    </div>
                );
                if (isProposer) return <button onClick={() => handleAction(trade, 'cancel')} className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded">Cancel</button>;
                return null;
            case TradeStatus.PAYMENT_PENDING:
                if ((isProposer && trade.proposerCash > 0) || (isReceiver && trade.receiverCash > 0)) return <button onClick={async () => { await submitPayment(trade.id, currentUser.id); addNotification('Payment submitted.', 'success'); loadTrades(); }} className="px-3 py-1 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded">Submit Payment</button>;
                return null;
            case TradeStatus.SHIPPING_PENDING:
                if (!((isProposer && trade.proposerSubmittedTracking) || (isReceiver && trade.receiverSubmittedTracking))) return <button onClick={async () => { await submitTracking(trade.id, currentUser.id, `TRACK-${Date.now()}`); addNotification('Tracking submitted.', 'success'); loadTrades(); }} className="px-3 py-1 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded">Add Tracking</button>;
                return null;
            case TradeStatus.DELIVERED_AWAITING_VERIFICATION:
                if (!((isProposer && trade.proposerVerifiedSatisfaction) || (isReceiver && trade.receiverVerifiedSatisfaction))) return (
                    <div className="flex gap-2"><button onClick={() => handleVerifySatisfaction(trade)} className="px-3 py-1 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 rounded">Verify Items</button><button onClick={() => { setActionTrade(trade); setIsDisputeModalOpen(true); }} className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded">Open Dispute</button></div>
                );
                return null;
            default: return null;
        }
    };

    const actionRequiredTrades = trades.filter(isActionRequired);
    const waitingTrades = trades.filter(t => !isActionRequired(t));

    const TradeList: React.FC<{ title: string, tradeList: Trade[] }> = ({ title, tradeList }) => (
        <div>
            <h2 className="text-xl font-bold text-gray-700 dark:text-white mb-4">{title}</h2>
            {tradeList.length > 0 ? (
                <div className="space-y-4">
                    {tradeList.map(trade => {
                        const otherUserId = trade.proposerId === currentUser?.id ? trade.receiverId : trade.proposerId;
                        const otherUser = users[otherUserId];
                        if (!otherUser || !currentUser) return null;
                        return (
                            <TradeCard key={trade.id} trade={trade} currentUser={currentUser} otherUser={otherUser} allItems={allItems} trackingData={trackingData[trade.id]}>
                                {renderActionButtons(trade)}
                            </TradeCard>
                        )
                    })}
                </div>
            ) : <p className="text-gray-500 dark:text-gray-400 text-sm">No trades in this category.</p>}
        </div>
    );

    if (isLoading) return <div className="p-8 text-center">Loading trades...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-amber-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                        🤝
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                            Active Trades
                        </h1>
                        <p className="mt-2 text-slate-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                            Review and manage your ongoing trades. Accept or counter incoming offers,
                            submit payments, add tracking numbers, and verify received items.
                        </p>
                    </div>
                </div>
            </div>
            <div className="space-y-10">
                <TradeList title="Action Required" tradeList={actionRequiredTrades} />
                <TradeList title="Waiting for Other Party" tradeList={waitingTrades} />
            </div>

            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleConfirm}
                title={`${confirmAction?.charAt(0).toUpperCase()}${confirmAction?.slice(1)} Trade`}
                confirmButtonText={`Yes, ${confirmAction}`}
                confirmButtonClass={confirmAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
                Are you sure you want to {confirmAction} this trade?
            </ConfirmationModal>

            {actionTrade && (
                <DisputeModal
                    isOpen={isDisputeModalOpen}
                    onClose={() => setIsDisputeModalOpen(false)}
                    onSubmit={handleDisputeSubmit}
                    tradeId={actionTrade.id}
                    isSubmitting={isSubmitting}
                />
            )}

            {actionTrade && currentUser && (
                <CounterOfferModal
                    isOpen={isCounterModalOpen}
                    onClose={() => { setIsCounterModalOpen(false); setActionTrade(null); }}
                    trade={actionTrade}
                    currentUser={currentUser}
                    otherUser={users[actionTrade.proposerId === currentUser.id ? actionTrade.receiverId : actionTrade.proposerId]}
                    allItems={allItems}
                    onCounterSubmitted={() => { loadTrades(); }}
                />
            )}
        </div>
    );
};

export default TradesPage;
