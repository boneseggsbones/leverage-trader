import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext';
import { fetchAllUsers, fetchTradesForUser, respondToTrade, cancelTrade, fetchRatingsForTrade, fetchAllItems, submitRating } from '../api/mockApi.ts';
import { User, Trade, TradeStatus, TradeRating, Item } from '../types.ts';
import ConfirmationModal from './ConfirmationModal.tsx';
import RatingModal from './RatingModal.tsx';
import RatingDisplayModal from './RatingDisplayModal.tsx';
import TradeCard from './TradeCard.tsx';

const TradesPage: React.FC = () => {
    const { currentUser } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();

    const [users, setUsers] = useState<User[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
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

        const loadTradesData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const [allUsers, userTrades, allItemsData] = await Promise.all([
                    fetchAllUsers(),
                    fetchTradesForUser(currentUser.id),
                    fetchAllItems(),
                ]);
                setUsers(allUsers);
                setTrades(userTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
                setAllItems(new Map(allItemsData.map(item => [item.id, item])));
            } catch (err) {
                setError("Failed to load trades data.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadTradesData();
    }, [currentUser, navigateTo]);

    const { incomingTrades, outgoingTrades, activeTrades, needsRating } = useMemo(() => {
        const incomingTrades: Trade[] = [];
        const outgoingTrades: Trade[] = [];
        const activeTrades: Trade[] = [];
        const needsRating: Trade[] = [];

        trades.forEach(trade => {
            if (trade.status === TradeStatus.PENDING_ACCEPTANCE) {
                if (trade.receiverId === currentUser?.id) incomingTrades.push(trade);
                else outgoingTrades.push(trade);
            } else if (trade.status === TradeStatus.COMPLETED_AWAITING_RATING) {
                needsRating.push(trade);
            } else if (![TradeStatus.REJECTED, TradeStatus.CANCELLED, TradeStatus.COMPLETED].includes(trade.status)) {
                activeTrades.push(trade);
            }
        });
        return { incomingTrades, outgoingTrades, activeTrades, needsRating };
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

    const handleRatingSubmit = async (formData: Omit<TradeRating, 'id' | 'tradeId' | 'raterId' | 'rateeId' | 'createdAt' | 'isRevealed'>) => {
        if (!ratingTrade || !currentUser) return;
        setIsSubmitting(true);
        try {
            await submitRating(ratingTrade.id, currentUser.id, formData);
            const updatedTrades = await fetchTradesForUser(currentUser.id);
            setTrades(updatedTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            addNotification("Rating submitted successfully!", 'success');
            setIsRatingModalOpen(false);
            setRatingTrade(null);
        } catch (err) {
            addNotification("Failed to submit rating.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading Trades...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!currentUser) return null;
    
    const otherUsers = users.filter(u => u.id !== currentUser.id);

    const renderTradeList = (title: string, tradeList: Trade[]) => (
        <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">{title}</h2>
            {tradeList.length === 0 ? (
                <div className="text-center py-10 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-500">No trades in this category.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tradeList.map(trade => {
                        const otherUserId = trade.proposerId === currentUser.id ? trade.receiverId : trade.proposerId;
                        const otherUser = users.find(u => u.id === otherUserId) || {name: 'Unknown User'} as User;
                        return (
                            <TradeCard key={trade.id} trade={trade} currentUser={currentUser} otherUser={otherUser} allItems={allItems}>
                                {trade.status === TradeStatus.PENDING_ACCEPTANCE && (
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
                            </TradeCard>
                        )
                    })}
                </div>
            )}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-12">
                {renderTradeList("Incoming Trade Offers", incomingTrades)}
                {renderTradeList("Needs Your Rating", needsRating)}
                {renderTradeList("Outgoing Trade Offers", outgoingTrades)}
                {renderTradeList("Active Trades", activeTrades)}
            </div>
            
            <ConfirmationModal isOpen={!!modalAction} onClose={() => setModalAction(null)} onConfirm={handleTradeAction} title={`Confirm Trade ${modalAction}`} confirmButtonText={`Yes, ${modalAction}`}>
                Are you sure you want to {modalAction} this trade?
            </ConfirmationModal>

            {isRatingModalOpen && ratingTrade && <RatingModal isOpen={isRatingModalOpen} onClose={() => setIsRatingModalOpen(false)} trade={ratingTrade} isSubmitting={isSubmitting} onSubmit={handleRatingSubmit} />}
            {isRatingDisplayModalOpen && ratingTrade && <RatingDisplayModal isOpen={isRatingDisplayModalOpen} onClose={() => setIsRatingDisplayModalOpen(false)} trade={ratingTrade} ratings={tradeRatings} currentUser={currentUser} otherUser={otherUsers.find(u => u.id !== currentUser.id) || null} />}
        </div>
    );
};

export default TradesPage;
