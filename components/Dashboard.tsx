import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext';
// Fix: Add .tsx extension to module imports
import { fetchAllUsers, fetchTradesForUser, respondToTrade, cancelTrade, fetchRatingsForTrade } from '../api/mockApi.ts';
import { User, Trade, TradeStatus, TradeRating } from '../types.ts';
import ConfirmationModal from './ConfirmationModal.tsx';
import RatingModal from './RatingModal.tsx';
import RatingDisplayModal from './RatingDisplayModal.tsx';

const Dashboard: React.FC = () => {
    const { currentUser, logout } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();

    const [users, setUsers] = useState<User[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionTrade, setActionTrade] = useState<Trade | null>(null);
    const [modalAction, setModalAction] = useState<'accept' | 'reject' | 'cancel' | null>(null);
    
    // State for rating modals
    const [ratingTrade, setRatingTrade] = useState<Trade | null>(null);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [isRatingDisplayModalOpen, setIsRatingDisplayModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [tradeRatings, setTradeRatings] = useState<TradeRating[]>([]);


    useEffect(() => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }

        const loadDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [allUsers, userTrades] = await Promise.all([
                    fetchAllUsers(),
                    fetchTradesForUser(currentUser.id),
                ]);
                setUsers(allUsers.filter(u => u.id !== currentUser.id));
                setTrades(userTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            } catch (err) {
                setError("Failed to load dashboard data.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardData();
    }, [currentUser, navigateTo]);

    const { incomingTrades, outgoingTrades, activeTrades, needsRating, completedTrades } = useMemo(() => {
        const incomingTrades: Trade[] = [];
        const outgoingTrades: Trade[] = [];
        const activeTrades: Trade[] = [];
        const needsRating: Trade[] = [];
        const completedTrades: Trade[] = [];

        trades.forEach(trade => {
            if (trade.status === TradeStatus.PENDING_ACCEPTANCE) {
                if (trade.receiverId === currentUser?.id) {
                    incomingTrades.push(trade);
                } else {
                    outgoingTrades.push(trade);
                }
            } else if (trade.status === TradeStatus.COMPLETED_AWAITING_RATING) {
                needsRating.push(trade);
            } else if ([TradeStatus.REJECTED, TradeStatus.CANCELLED, TradeStatus.COMPLETED].includes(trade.status)) {
                 completedTrades.push(trade);
            } else {
                activeTrades.push(trade);
            }
        });
        return { incomingTrades, outgoingTrades, activeTrades, needsRating, completedTrades };
    }, [trades, currentUser]);
    
    const handleTradeAction = async () => {
        if (!actionTrade || !modalAction) return;

        setIsSubmitting(true);
        try {
            let result: Trade;
            if (modalAction === 'cancel') {
                result = await cancelTrade(actionTrade.id, currentUser!.id);
                 addNotification('Trade cancelled successfully.', 'info');
            } else {
                result = await respondToTrade(actionTrade.id, modalAction);
                addNotification(`Trade ${modalAction}ed successfully.`, 'success');
            }
            setTrades(prev => prev.map(t => t.id === result.id ? result : t));
        } catch (err) {
            addNotification(`Failed to ${modalAction} trade.`, 'error');
            console.error(err);
        } finally {
            setIsSubmitting(false);
            setActionTrade(null);
            setModalAction(null);
        }
    };
    
    const openModal = (trade: Trade, action: 'accept' | 'reject' | 'cancel') => {
        setActionTrade(trade);
        setModalAction(action);
    };

    const handleOpenRatingModal = (trade: Trade) => {
        setRatingTrade(trade);
        setIsRatingModalOpen(true);
    };

    const handleOpenRatingDisplayModal = async (trade: Trade) => {
        setRatingTrade(trade);
        const ratings = await fetchRatingsForTrade(trade.id);
        setTradeRatings(ratings);
        setIsRatingDisplayModalOpen(true);
    };

    if (isLoading) return <div className="p-8 text-center">Loading Dashboard...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!currentUser) return null;

    const renderTradeList = (title: string, tradeList: Trade[], isActionable: boolean = false) => (
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-xl font-bold text-gray-700 mb-4">{title}</h2>
            {tradeList.length === 0 ? (
                <p className="text-slate-500">No trades in this category.</p>
            ) : (
                <div className="space-y-3">
                    {tradeList.map(trade => {
                        const otherUserId = trade.proposerId === currentUser.id ? trade.receiverId : trade.proposerId;
                        const otherUser = users.find(u => u.id === otherUserId) || {name: 'Unknown User'};
                        return (
                            <div key={trade.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-gray-800">Trade with {otherUser.name}</p>
                                    <p className="text-sm text-slate-500">Status: <span className="font-medium">{trade.status.replace(/_/g, ' ')}</span></p>
                                </div>
                                {isActionable && trade.status === TradeStatus.PENDING_ACCEPTANCE && (
                                     <div className="flex gap-2">
                                        {trade.receiverId === currentUser.id ? (
                                            <>
                                                <button onClick={() => openModal(trade, 'accept')} className="px-3 py-1 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 rounded">Accept</button>
                                                <button onClick={() => openModal(trade, 'reject')} className="px-3 py-1 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded">Reject</button>
                                            </>
                                        ) : (
                                            <button onClick={() => openModal(trade, 'cancel')} className="px-3 py-1 text-xs font-semibold text-white bg-gray-500 hover:bg-gray-600 rounded">Cancel</button>
                                        )}
                                    </div>
                                )}
                                {trade.status === TradeStatus.COMPLETED_AWAITING_RATING && (
                                    <button onClick={() => handleOpenRatingModal(trade)} className="px-3 py-1 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded">Rate Trade</button>
                                )}
                                {trade.status === TradeStatus.COMPLETED && (
                                     <button onClick={() => handleOpenRatingDisplayModal(trade)} className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded">View Rating</button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-7xl mx-auto">
                    <header className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">Welcome, {currentUser.name}</h1>
                            <div className="flex items-center gap-4 text-slate-500 mt-2">
                                <span>Cash: <strong>${(currentUser.cash / 100).toLocaleString()}</strong></span>
                                <span>Reputation: <strong>{currentUser.valuationReputationScore}</strong></span>
                                <span>Net Surplus: <strong className={currentUser.netTradeSurplus >= 0 ? 'text-green-600' : 'text-red-600'}>${(currentUser.netTradeSurplus / 100).toLocaleString()}</strong></span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => navigateTo('trade-history')} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors">Trade History</button>
                            <button onClick={logout} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors">Logout</button>
                        </div>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-6">
                            {renderTradeList("Incoming Trade Offers", incomingTrades, true)}
                            {renderTradeList("Needs Your Rating", needsRating)}
                            {renderTradeList("Outgoing Trade Offers", outgoingTrades, true)}
                            {renderTradeList("Active Trades", activeTrades)}
                        </div>
                        <div className="md:col-span-1">
                             <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
                                <h2 className="text-xl font-bold text-gray-700 mb-4">Start a New Trade</h2>
                                <div className="space-y-2">
                                    {users.map(user => (
                                        <button 
                                            key={user.id} 
                                            onClick={() => navigateTo('trade-desk', { otherUserId: user.id })}
                                            className="w-full text-left p-3 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
                                        >
                                            <p className="font-semibold text-blue-800">{user.name}</p>
                                            <p className="text-xs text-blue-600">{user.inventory.length} items available</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <ConfirmationModal
                isOpen={!!modalAction}
                onClose={() => setModalAction(null)}
                onConfirm={handleTradeAction}
                title={`Confirm Trade ${modalAction}`}
                confirmButtonText={`Yes, ${modalAction}`}
            >
                Are you sure you want to {modalAction} this trade?
            </ConfirmationModal>

            {isRatingModalOpen && ratingTrade && (
                <RatingModal 
                    isOpen={isRatingModalOpen}
                    onClose={() => setIsRatingModalOpen(false)}
                    trade={ratingTrade}
                    isSubmitting={isSubmitting}
                    onSubmit={() => { /* Real submit logic here */
                        addNotification("Rating submitted!", "success");
                        setIsRatingModalOpen(false);
                    }}
                />
            )}
            {isRatingDisplayModalOpen && ratingTrade && (
                 <RatingDisplayModal
                    isOpen={isRatingDisplayModalOpen}
                    onClose={() => setIsRatingDisplayModalOpen(false)}
                    trade={ratingTrade}
                    ratings={tradeRatings}
                    currentUser={currentUser}
                    otherUser={users.find(u => u.id !== currentUser.id) || null}
                 />
            )}
        </div>
    );
};

export default Dashboard;
