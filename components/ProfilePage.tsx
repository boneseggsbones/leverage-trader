
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchUser, fetchCompletedTradesForUser, fetchAllItems } from '../api/mockApi.ts';
import { User, Trade, Item } from '../types.ts';
import ItemCard from './ItemCard.tsx';
import AssetLineageGraph from './visualization/AssetLineageGraph.tsx';
import GraphInspectorPanel from './visualization/GraphInspectorPanel.tsx';

const ProfilePage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const [profileUser, setProfileUser] = useState<User | null>(null);
    const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNodeData, setSelectedNodeData] = useState<any>(null);

    useEffect(() => {
        if (!userId) {
            setError("No user specified for profile view.");
            setIsLoading(false);
            return;
        }

        const loadProfileData = async () => {
            setIsLoading(true);
            try {
                const [user, trades, allItemsData] = await Promise.all([
                    fetchUser(userId),
                    fetchCompletedTradesForUser(userId),
                    fetchAllItems()
                ]);

                if (user) {
                    setProfileUser(user);
                    setCompletedTrades(trades);
                    setAllItems(new Map(allItemsData.map(item => [item.id, item])));
                } else {
                    setError("Could not find the specified user.");
                }
            } catch (err) {
                setError("Failed to load profile data.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadProfileData();
    }, [userId]);

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!profileUser) return <div className="p-8 text-center text-gray-500">User not found.</div>;

    const isCurrentUserProfile = currentUser?.id === profileUser.id;

    const accountAge = Math.floor((new Date().getTime() - new Date(profileUser.accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24));
    const accountAgeString = accountAge > 30 ? `${Math.floor(accountAge / 30)} months` : `${accountAge} days`;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-sky-50 rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                        👤
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                            {isCurrentUserProfile ? 'Your Profile' : `${profileUser.name}'s Profile`}
                        </h1>
                        <p className="mt-2 text-slate-600 leading-relaxed max-w-2xl">
                            {isCurrentUserProfile
                                ? "View your trading stats, reputation, and trade-up journey. See how your collection has evolved over time."
                                : `Check out ${profileUser.name}'s inventory and trading history. Start a trade to make an offer on their items.`
                            }
                        </p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Profile Info */}
                <div className="md:col-span-1">
                    <div className="p-6 bg-white rounded-lg border border-gray-200 text-center">
                        <img
                            src={profileUser.profilePictureUrl}
                            alt={profileUser.name}
                            className="w-32 h-32 rounded-full mx-auto mb-4 border-4 border-gray-100"
                        />
                        <h1 className="text-2xl font-bold text-gray-800">{profileUser.name}</h1>
                        <p className="text-sm text-gray-500">{profileUser.city}, {profileUser.state}</p>

                        <div className="mt-6 text-left space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Reputation:</span>
                                <span className="font-bold text-blue-600">{profileUser.valuationReputationScore}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Completed Trades:</span>
                                <span className="font-bold text-gray-800">{completedTrades.length}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-600">Member For:</span>
                                <span className="font-bold text-gray-800">{accountAgeString}</span>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-200 text-left">
                            <h3 className="text-sm font-semibold text-gray-500 mb-2">About Me</h3>
                            <p className="text-sm text-gray-700">{profileUser.aboutMe}</p>
                        </div>

                        {!isCurrentUserProfile && (
                            <button
                                onClick={() => navigate(`/trade-desk/${profileUser.id}`)}
                                className="mt-8 w-full px-4 py-2 text-md font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                            >
                                Start Trade
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Inventory and Trade-Up Journey */}
                <div className="md:col-span-2 space-y-8">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">{isCurrentUserProfile ? "Your Inventory" : `${profileUser.name}'s Inventory`}</h2>
                        {profileUser.inventory.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {profileUser.inventory.map(item => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                                <h3 className="text-xl font-semibold text-gray-700">Inventory is empty.</h3>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2 bg-white p-6 rounded-lg border border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">Trade-Up Journey</h2>
                            <AssetLineageGraph trades={completedTrades} userId={profileUser.id} allItems={allItems} onNodeClick={setSelectedNodeData} />
                        </div>
                        <div className="col-span-1">
                            <GraphInspectorPanel selectedNodeData={selectedNodeData} trades={completedTrades} userId={profileUser.id} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
