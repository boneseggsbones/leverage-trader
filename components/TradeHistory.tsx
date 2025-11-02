// Fix: Implemented the TradeHistory component.
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { fetchTradesForUser, fetchAllUsers, fetchAllItems, submitRating } from '../api/mockApi.ts';
import { Trade, User, TradeStatus, Item, TradeRating } from '../types.ts';
import { useNotification } from '../context/NotificationContext.tsx';
import RatingModal from './RatingModal.tsx';

const TradeHistory: React.FC = () => {
    const { currentUser } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();
    
    const [trades, setTrades] = useState<Trade[]>([]);
    const [users, setUsers] = useState<Record<string, User>>({});
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for rating modal
    const [ratingTrade, setRatingTrade] = useState<Trade | null>(null);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadHistory = useCallback(async () => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }
        setIsLoading(true);
        try {
            const [userTrades, allUsers, allItemsData] = await Promise.all([
                fetchTradesForUser(currentUser.id),
                fetchAllUsers(),
                fetchAllItems(),
            ]);
            
            const userMap = [...allUsers, currentUser].reduce((acc, user) => {
                if(user) acc[user.id] = user;
                return acc;
            }, {} as Record<string, User>);

            setUsers(userMap);
            setAllItems(new Map(allItemsData.map(item => [item.id, item])));
            setTrades(
                userTrades
                    .filter(t => t.status !== TradeStatus.PENDING_ACCEPTANCE)
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            );
        } catch (err) {
            setError('Failed to load trade history.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, navigateTo]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);
    
    if (!currentUser) return null;
    
    const handleOpenRatingModal = (trade: Trade) => {
        setRatingTrade(trade);
        setIsRatingModalOpen(true);
    };

    const handleRatingSubmit = async (formData: Omit<TradeRating, 'id' | 'tradeId' | 'raterId' | 'rateeId' | 'createdAt' | 'isRevealed'>) => {
        if (!ratingTrade || !currentUser) return;
        setIsSubmitting(true);
        try {
            await submitRating(ratingTrade.id, currentUser.id, formData);
            addNotification("Rating submitted successfully!", 'success');
            setIsRatingModalOpen(false);
            setRatingTrade(null);
            await loadHistory(); // Refetch data
        } catch (err) {
            addNotification("Failed to submit rating.", 'error');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusColor = (status: Trade['status']) => {
        switch (status) {
            case TradeStatus.COMPLETED: return 'bg-green-100 text-green-800';
            case TradeStatus.REJECTED: return 'bg-red-100 text-red-800';
            case TradeStatus.CANCELLED: return 'bg-gray-100 text-gray-800';
            case TradeStatus.ACCEPTED:
            case TradeStatus.PAYMENT_PENDING:
            case TradeStatus.ESCROW_FUNDED:
            case TradeStatus.SHIPPING_PENDING:
            case TradeStatus.IN_TRANSIT:
            case TradeStatus.DELIVERED_AWAITING_VERIFICATION:
                 return 'bg-blue-100 text-blue-800';
            case TradeStatus.DISPUTE_OPENED:
            case TradeStatus.DISPUTE_RESOLVED:
                return 'bg-purple-100 text-purple-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };
    
    const renderStatusBadge = (trade: Trade) => {
        if (trade.status === TradeStatus.COMPLETED_AWAITING_RATING) {
            const hasCurrentUserRated = (trade.proposerId === currentUser.id && trade.proposerRated) || (trade.receiverId === currentUser.id && trade.receiverRated);
            const isWindowOpen = trade.ratingDeadline && new Date(trade.ratingDeadline).getTime() > Date.now();

            if (!hasCurrentUserRated && isWindowOpen) {
                return (
                    <button onClick={() => handleOpenRatingModal(trade)} className="px-3 py-1 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-full transition-colors">
                        Rate Trade
                    </button>
                );
            } else if (hasCurrentUserRated && isWindowOpen) {
                return (
                    <div className="px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">
                        Awaiting Other Party
                    </div>
                );
            } else {
                 return (
                    <div className="px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">
                        Rating Window Closed
                    </div>
                );
            }
        }

        return (
            <div className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(trade.status)}`}>
                {trade.status.replace(/_/g, ' ')}
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">Trade History</h1>
                    <button
                        onClick={() => navigateTo('dashboard')}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                    >
                        Back to Dashboard
                    </button>
                </div>

                <div className="bg-white rounded-lg shadow-md border border-gray-200">
                    <div className="divide-y divide-gray-200">
                        {isLoading ? (
                            <p className="p-6 text-center text-gray-500">Loading history...</p>
                        ) : error ? (
                            <p className="p-6 text-center text-red-500">{error}</p>
                        ) : trades.length === 0 ? (
                             <p className="p-6 text-center text-gray-500">No past trades found.</p>
                        ) : (
                            trades.map(trade => {
                                const otherPartyId = trade.proposerId === currentUser.id ? trade.receiverId : trade.proposerId;
                                const otherPartyName = users[otherPartyId]?.name || 'Unknown User';
                                const wasProposer = trade.proposerId === currentUser.id;

                                const youGaveItemIds = wasProposer ? trade.proposerItemIds : trade.receiverItemIds;
                                const youGaveCash = wasProposer ? trade.proposerCash : trade.receiverCash;
                                const youGotItemIds = wasProposer ? trade.receiverItemIds : trade.proposerItemIds;
                                const youGotCash = wasProposer ? trade.receiverCash : trade.proposerCash;

                                const youGaveItems = youGaveItemIds.map(id => allItems.get(id)).filter(Boolean) as Item[];
                                const youGotItems = youGotItemIds.map(id => allItems.get(id)).filter(Boolean) as Item[];
                                
                                const valueGiven = youGaveItems.reduce((sum, item) => sum + item.estimatedMarketValue, 0) + youGaveCash;
                                const valueGotten = youGotItems.reduce((sum, item) => sum + item.estimatedMarketValue, 0) + youGotCash;
                                
                                const netValue = valueGotten - valueGiven;

                                return (
                                    <div key={trade.id} className="p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-gray-800 text-lg">
                                                    Trade with {otherPartyName}
                                                </p>
                                                <div className="text-sm text-gray-500 mt-1 space-y-1">
                                                    <p>
                                                        <span className="font-semibold text-gray-600">Proposed:</span> {wasProposer ? 'You proposed' : `${otherPartyName} proposed`} on {new Date(trade.createdAt).toLocaleDateString()}
                                                    </p>
                                                    <p>
                                                        <span className="font-semibold text-gray-600">Finalized:</span> {new Date(trade.updatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-4">
                                                {renderStatusBadge(trade)}
                                                 { (trade.status === TradeStatus.COMPLETED || trade.status === TradeStatus.DISPUTE_RESOLVED || trade.status === TradeStatus.COMPLETED_AWAITING_RATING) &&
                                                    <div className="mt-2">
                                                        <p className="text-xs text-gray-500">Net Value</p>
                                                        <p className={`font-bold text-lg ${
                                                            netValue > 0 ? 'text-green-600' : netValue < 0 ? 'text-red-600' : 'text-gray-700'
                                                        }`}>
                                                            {netValue > 0 ? '+' : ''}${(netValue / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
            {isRatingModalOpen && ratingTrade && (
                <RatingModal 
                    isOpen={isRatingModalOpen}
                    onClose={() => setIsRatingModalOpen(false)}
                    trade={ratingTrade}
                    isSubmitting={isSubmitting}
                    onSubmit={handleRatingSubmit}
                />
            )}
        </div>
    );
};

export default TradeHistory;