// Fix: Implemented the Dashboard component.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext';
import { fetchAllUsers, fetchTradesForUser, respondToTrade } from '../api/mockApi';
import { User, Trade, TradeStatus } from '../types';
import ItemCard from './ItemCard';

const Dashboard: React.FC = () => {
    const { currentUser, logout } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();

    const [otherUsers, setOtherUsers] = useState<User[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }

        const loadDashboardData = async () => {
            try {
                setIsLoading(true);
                const [allUsers, userTrades] = await Promise.all([
                    fetchAllUsers(),
                    fetchTradesForUser(currentUser.id),
                ]);
                setOtherUsers(allUsers.filter(u => u.id !== currentUser.id));
                setTrades(userTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
                setError(null);
            } catch (err) {
                setError("Failed to load dashboard data. Please refresh.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardData();
    }, [currentUser, navigateTo]);

    const handleTradeResponse = async (tradeId: string, response: 'accept' | 'reject' | 'cancel') => {
        try {
            const updatedTrade = await respondToTrade(tradeId, response);
            setTrades(prev => prev.map(t => t.id === tradeId ? updatedTrade : t));
            addNotification(`Trade action successful.`, 'success');
             // In a real app, user data would be refetched here.
        } catch (err) {
            addNotification(`Failed to respond to trade.`, 'error');
            console.error(err);
        }
    };
    
    if (!currentUser) return null;

    const renderTrade = (trade: Trade) => {
        const isReceiver = trade.receiverId === currentUser.id;
        const otherPartyId = isReceiver ? trade.proposerId : trade.receiverId;
        const otherParty = [...otherUsers, currentUser].find(u => u.id === otherPartyId);


        return (
             <div key={trade.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500">
                    Trade with <span className="font-bold">{otherParty?.name || 'Unknown User'}</span>
                    <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full ${trade.status === TradeStatus.PENDING_ACCEPTANCE ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{trade.status}</span>
                </p>
                <p className="text-xs text-gray-400">Last updated: {new Date(trade.updatedAt).toLocaleDateString()}</p>
                 {trade.status === TradeStatus.PENDING_ACCEPTANCE && (
                    <div className="mt-4 flex gap-2">
                        {isReceiver ? (
                            <>
                                <button onClick={() => handleTradeResponse(trade.id, 'accept')} className="px-3 py-1 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md">Accept</button>
                                <button onClick={() => handleTradeResponse(trade.id, 'reject')} className="px-3 py-1 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md">Reject</button>
                            </>
                        ) : (
                             <button onClick={() => handleTradeResponse(trade.id, 'cancel')} className="px-3 py-1 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md">Cancel</button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Welcome, {currentUser.name}</h1>
                         <p className="text-sm text-slate-500">Cash: ${(currentUser.cash / 100).toLocaleString()}</p>
                    </div>
                    <div>
                         <button onClick={() => navigateTo('trade-history')} className="mr-4 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Trade History</button>
                        <button onClick={logout} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md">Logout</button>
                    </div>
                </div>
            </header>
            <main className="py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 mb-4">Your Inventory</h2>
                            <div className="bg-white p-4 rounded-lg shadow">
                                {currentUser.inventory.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {currentUser.inventory.map(item => <ItemCard key={item.id} item={item} />)}
                                    </div>
                                ) : <p className="text-slate-500">Your inventory is empty.</p>}
                            </div>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 mb-4">Other Traders</h2>
                             <div className="bg-white p-4 rounded-lg shadow">
                                <div className="space-y-4">
                                    {otherUsers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-2 border-b border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full" />
                                                <span className="font-semibold">{user.name}</span>
                                            </div>
                                            <button onClick={() => navigateTo('trade-desk', { otherUserId: user.id })} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md">
                                                Trade
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <h2 className="text-xl font-bold text-gray-700 mb-4">Trade Activity</h2>
                        <div className="bg-white p-4 rounded-lg shadow space-y-4">
                            {isLoading ? <p>Loading trades...</p> : error ? <p className="text-red-500">{error}</p> : trades.length > 0 ? trades.map(renderTrade) : <p className="text-slate-500">No active trades.</p>}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
