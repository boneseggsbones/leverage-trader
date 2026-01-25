
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
    fetchTrackingStatus,
    fundEscrow as fundEscrowApi,
    fetchEscrowStatus
} from '../api/api.ts';
import { Trade, User, Item, TradeStatus, DisputeType } from '../types.ts';
import TradeCard, { TradeTrackingData, EscrowDisplayInfo } from './TradeCard.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import DisputeModal from './DisputeModal.tsx';
import CounterOfferModal from './CounterOfferModal.tsx';
import EscrowPaymentModal from './EscrowPaymentModal.tsx';
import { TradeCardSkeleton } from './Skeleton.tsx';

const TradesPage: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { addNotification } = useNotification();

    const [trades, setTrades] = useState<Trade[]>([]);
    const [users, setUsers] = useState<Record<string, User>>({});
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
    const [trackingData, setTrackingData] = useState<Record<string, TradeTrackingData>>({});
    const [escrowData, setEscrowData] = useState<Record<string, EscrowDisplayInfo | null>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [highlightedTradeId, setHighlightedTradeId] = useState<string | null>(null);
    const tradeRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const [actionTrade, setActionTrade] = useState<Trade | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
    const [isEscrowModalOpen, setIsEscrowModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | 'cancel' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Handle highlight from URL parameter
    useEffect(() => {
        const highlight = searchParams.get('highlight');
        if (highlight) {
            setHighlightedTradeId(highlight);
            // Clear the URL parameter
            searchParams.delete('highlight');
            setSearchParams(searchParams, { replace: true });
            // Auto-clear highlight after 3 seconds
            setTimeout(() => setHighlightedTradeId(null), 3000);
        }
    }, [searchParams, setSearchParams]);

    // Scroll to highlighted trade when trades load
    useEffect(() => {
        if (highlightedTradeId && !isLoading && tradeRefs.current[highlightedTradeId]) {
            tradeRefs.current[highlightedTradeId]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }, [highlightedTradeId, isLoading]);

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

            // Fetch escrow info for trades with escrow
            const escrowTrades = activeTrades.filter(t =>
                t.status === TradeStatus.ESCROW_FUNDED ||
                t.status === TradeStatus.SHIPPING_PENDING ||
                t.status === TradeStatus.IN_TRANSIT ||
                t.status === TradeStatus.DELIVERED_AWAITING_VERIFICATION
            );

            if (escrowTrades.length > 0) {
                const escrowResults = await Promise.all(
                    escrowTrades.map(async (trade) => {
                        try {
                            const status = await fetchEscrowStatus(trade.id);
                            if (status.escrowHold) {
                                return {
                                    tradeId: trade.id,
                                    info: {
                                        id: status.escrowHold.id,
                                        amount: status.escrowHold.amount,
                                        status: status.escrowHold.status,
                                        provider: status.escrowHold.provider,
                                        fundedAt: status.escrowHold.createdAt,
                                    } as EscrowDisplayInfo
                                };
                            }
                            return null;
                        } catch {
                            return null;
                        }
                    })
                );

                const escrowMap: Record<string, EscrowDisplayInfo | null> = {};
                escrowResults.forEach(result => {
                    if (result) {
                        escrowMap[result.tradeId] = result.info;
                    }
                });
                setEscrowData(escrowMap);
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
                // Show Fund Escrow button that opens the modal
                if ((isProposer && trade.proposerCash > 0) || (isReceiver && trade.receiverCash > 0)) {
                    return (
                        <button
                            onClick={() => { setActionTrade(trade); setIsEscrowModalOpen(true); }}
                            className="px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded shadow-sm"
                        >
                            💳 Fund Escrow
                        </button>
                    );
                }
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
                        const isHighlighted = highlightedTradeId === trade.id;
                        return (
                            <div
                                key={trade.id}
                                ref={el => { tradeRefs.current[trade.id] = el; }}
                                className={`transition-all duration-500 rounded-lg ${isHighlighted
                                    ? 'ring-4 ring-blue-400 ring-opacity-75 animate-pulse shadow-lg shadow-blue-200 dark:shadow-blue-900'
                                    : ''
                                    }`}
                            >
                                <TradeCard trade={trade} currentUser={currentUser} otherUser={otherUser} allItems={allItems} trackingData={trackingData[trade.id]} escrowInfo={escrowData[trade.id]}>
                                    {renderActionButtons(trade)}
                                </TradeCard>
                            </div>
                        )
                    })}
                </div>
            ) : <p className="text-gray-500 dark:text-gray-400 text-sm">No trades in this category.</p>}
        </div>
    );

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-amber-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                    <div className="animate-pulse flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                        <div className="flex-1">
                            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-40 mb-2"></div>
                            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <TradeCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }
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
                {/* Show comprehensive empty state when no trades at all */}
                {trades.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-full mb-6">
                            <span className="text-5xl">🤝</span>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
                            No Active Trades Yet
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
                            Your trade journey starts here! Browse items from other collectors and propose trades to grow your collection.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-blue-500/25 transition-all"
                            >
                                <span>🔍</span>
                                Discover Items
                            </button>
                            <button
                                onClick={() => navigate('/inventory')}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                            >
                                <span>📦</span>
                                Add Inventory
                            </button>
                        </div>
                        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 max-w-lg mx-auto">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                <span className="font-medium">💡 Pro tip:</span> Complete your profile and add items to your inventory to attract more trade offers!
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Action Required Section */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 dark:text-white mb-4">Action Required</h2>
                            {actionRequiredTrades.length > 0 ? (
                                <div className="space-y-4">
                                    {actionRequiredTrades.map(trade => {
                                        const otherUserId = trade.proposerId === currentUser?.id ? trade.receiverId : trade.proposerId;
                                        const otherUser = users[otherUserId];
                                        if (!otherUser || !currentUser) return null;
                                        const isHighlighted = highlightedTradeId === trade.id;
                                        return (
                                            <div
                                                key={trade.id}
                                                ref={el => { tradeRefs.current[trade.id] = el; }}
                                                className={`transition-all duration-500 rounded-lg ${isHighlighted
                                                    ? 'ring-4 ring-blue-400 ring-opacity-75 animate-pulse shadow-lg shadow-blue-200 dark:shadow-blue-900'
                                                    : ''
                                                    }`}
                                            >
                                                <TradeCard trade={trade} currentUser={currentUser} otherUser={otherUser} allItems={allItems} trackingData={trackingData[trade.id]} escrowInfo={escrowData[trade.id]}>
                                                    {renderActionButtons(trade)}
                                                </TradeCard>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 text-center">
                                    <span className="text-3xl mb-2 block">✅</span>
                                    <p className="text-green-700 dark:text-green-400 font-medium">You're all caught up!</p>
                                    <p className="text-green-600 dark:text-green-500 text-sm mt-1">No pending actions required on your end.</p>
                                </div>
                            )}
                        </div>

                        {/* Waiting for Other Party Section */}
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 dark:text-white mb-4">Waiting for Other Party</h2>
                            {waitingTrades.length > 0 ? (
                                <div className="space-y-4">
                                    {waitingTrades.map(trade => {
                                        const otherUserId = trade.proposerId === currentUser?.id ? trade.receiverId : trade.proposerId;
                                        const otherUser = users[otherUserId];
                                        if (!otherUser || !currentUser) return null;
                                        const isHighlighted = highlightedTradeId === trade.id;
                                        return (
                                            <div
                                                key={trade.id}
                                                ref={el => { tradeRefs.current[trade.id] = el; }}
                                                className={`transition-all duration-500 rounded-lg ${isHighlighted
                                                    ? 'ring-4 ring-blue-400 ring-opacity-75 animate-pulse shadow-lg shadow-blue-200 dark:shadow-blue-900'
                                                    : ''
                                                    }`}
                                            >
                                                <TradeCard trade={trade} currentUser={currentUser} otherUser={otherUser} allItems={allItems} trackingData={trackingData[trade.id]} escrowInfo={escrowData[trade.id]}>
                                                    {renderActionButtons(trade)}
                                                </TradeCard>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
                                    <span className="text-3xl mb-2 block">⏳</span>
                                    <p className="text-gray-600 dark:text-gray-400 font-medium">No pending trades</p>
                                    <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">Trades you're waiting on will appear here.</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
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

            {actionTrade && (
                <EscrowPaymentModal
                    isOpen={isEscrowModalOpen}
                    onClose={() => { setIsEscrowModalOpen(false); setActionTrade(null); }}
                    trade={actionTrade}
                    onPaymentSuccess={() => {
                        addNotification('Escrow funded successfully!', 'success');
                        loadTrades();
                    }}
                />
            )}
        </div>
    );
};

export default TradesPage;
