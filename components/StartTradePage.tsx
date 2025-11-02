import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { fetchAllUsers } from '../api/mockApi.ts';
import { User } from '../types.ts';

const StartTradePage: React.FC = () => {
    const { currentUser } = useAuth();
    const { navigateTo } = useNavigation();
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Start a New Trade</h1>
            <p className="text-gray-600 mb-8">Select a user from the list below to open the Trade Desk and begin crafting your offer.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map(user => (
                    <div 
                        key={user.id} 
                        className="p-6 bg-white rounded-xl border border-gray-200 flex flex-col"
                    >
                        <div className="flex-grow">
                            <button onClick={(e) => { e.stopPropagation(); navigateTo('profile', { userId: user.id })}} className="text-xl font-bold text-gray-800 hover:underline">{user.name}</button>
                            <div className="mt-4 space-y-2 text-sm text-gray-600">
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
                                onClick={() => navigateTo('trade-desk', { otherUserId: user.id })}
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