// Fix: Implemented the TradeHistory component.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { fetchTradesForUser, fetchAllUsers } from '../api/mockApi';
import { Trade, User, TradeStatus } from '../types';

const TradeHistory: React.FC = () => {
    const { currentUser } = useAuth();
    const { navigateTo } = useNavigation();
    const [trades, setTrades] = useState<Trade[]>([]);
    const [users, setUsers] = useState<Record<string, User>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }

        const loadHistory = async () => {
            try {
                const [userTrades, allUsers] = await Promise.all([
                    fetchTradesForUser(currentUser.id),
                    fetchAllUsers(),
                ]);
                
                const userMap = [...allUsers, currentUser].reduce((acc, user) => {
                    if(user) acc[user.id] = user;
                    return acc;
                }, {} as Record<string, User>);

                setUsers(userMap);
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
        };

        loadHistory();
    }, [currentUser, navigateTo]);
    
    if (!currentUser) return null;
    
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
                                
                                return (
                                    <div key={trade.id} className="p-4 hover:bg-gray-50">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800">
                                                    Trade with {otherPartyName}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {wasProposer ? 'You proposed' : `${otherPartyName} proposed`} on {new Date(trade.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(trade.status)}`}>
                                                {trade.status.replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TradeHistory;