
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchAllUsers } from '../api/mockApi.ts';
import { User } from '../types.ts';

const StartTradePage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;
        const loadUsers = async () => {
            setIsLoading(true);
            const allUsers = await fetchAllUsers();
            setUsers(allUsers.filter(u => u.id !== currentUser.id));
            setIsLoading(false);
        };
        loadUsers();
    }, [currentUser]);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading users...</div>;
    }

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-cyan-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                        🚀
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                            Start a New Trade
                        </h1>
                        <p className="mt-2 text-slate-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                            Select a trader from the list below to open their Trade Desk.
                            From there you can browse their inventory and craft your offer.
                        </p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map(user => (
                    <div
                        key={user.id}
                        className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col transition-colors"
                    >
                        <div className="flex-grow">
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/profile/${user.id}`) }} className="text-xl font-bold text-gray-800 dark:text-white hover:underline">{user.name}</button>
                            <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                                <div className="flex justify-between">
                                    <span>Items:</span>
                                    <span className="font-semibold">{user.inventory.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Reputation:</span>
                                    <span className="font-semibold">{user.valuationReputationScore}</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6">
                            <button
                                onClick={() => navigate(`/trade-desk/${user.id}`)}
                                className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Open Trade Desk
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StartTradePage;