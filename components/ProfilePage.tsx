import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { fetchUser, fetchCompletedTradesForUser, fetchAllItems, fetchTradesForUser } from '../api/api.ts';
import { User, Trade, Item, TradeStatus } from '../types.ts';
import ItemCard from './ItemCard.tsx';
import ItemValuationModal from './ItemValuationModal.tsx';
import TradeJourneyTimeline from './visualization/TradeJourneyTimeline.tsx';
import EmailPreferencesSettings from './EmailPreferencesSettings.tsx';
import EditProfileModal from './EditProfileModal.tsx';
import CollectionStats from './CollectionStats.tsx';
import AccountSection from './AccountSection.tsx';
import PaymentMethodsSection from './PaymentMethodsSection.tsx';
import { formatCurrency } from '../utils/currency.ts';

type ProfileTab = 'overview' | 'account' | 'payments' | 'notifications';

const ProfilePage: React.FC = () => {
    const { currentUser, oauthProfile } = useAuth();
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const [profileUser, setProfileUser] = useState<User | null>(null);
    const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
    const [allItems, setAllItems] = useState<Map<string, Item>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [showValuationModal, setShowValuationModal] = useState(false);
    const [showAllItems, setShowAllItems] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [tradesWith, setTradesWith] = useState<Trade[]>([]);
    const [activeTab, setActiveTab] = useState<ProfileTab>('overview');

    const isCurrentUserProfile = currentUser?.id?.toString() === userId;

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
                    setAllItems(new Map(allItemsData.map(item => [String(item.id), item])));

                    // If viewing another user, fetch trades between you and them
                    if (currentUser && !isCurrentUserProfile) {
                        const myTrades = await fetchTradesForUser(currentUser.id);
                        const tradesWithUser = myTrades.filter(t =>
                            (t.proposerId.toString() === userId || t.receiverId.toString() === userId)
                        );
                        setTradesWith(tradesWithUser);
                    }
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
    }, [userId, currentUser, isCurrentUserProfile]);

    const handleProfileUpdate = async (updates: Partial<User & { location?: string }>) => {
        if (!profileUser) return;

        const response = await fetch(`http://localhost:4000/api/users/${profileUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });

        if (!response.ok) {
            throw new Error('Failed to update profile');
        }

        const updated = await response.json();
        setProfileUser({ ...profileUser, ...updated });
    };

    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-8">
                <div className="animate-pulse space-y-6">
                    <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                    <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
                </div>
            </div>
        );
    }

    if (error) return <div className="p-8 text-center text-red-500 dark:text-red-400">{error}</div>;
    if (!profileUser) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">User not found.</div>;

    const accountAge = Math.floor((new Date().getTime() - new Date(profileUser.accountCreatedAt || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
    const accountAgeString = accountAge > 365 ? `${Math.floor(accountAge / 365)} years` : accountAge > 30 ? `${Math.floor(accountAge / 30)} months` : `${accountAge} days`;

    // Featured items (top 4 by value)
    const featuredItems = [...profileUser.inventory]
        .sort((a, b) => (b.estimatedMarketValue || 0) - (a.estimatedMarketValue || 0))
        .slice(0, 4);

    // Calculate total inventory value
    const totalInventoryValue = profileUser.inventory.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0);

    // ===========================================
    // SELF-VIEW: Your Own Profile (Tabbed Layout)
    // ===========================================
    if (isCurrentUserProfile) {
        const tabs: { id: ProfileTab; label: string; icon: string }[] = [
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'account', label: 'Account', icon: '👤' },
            { id: 'payments', label: 'Payment Methods', icon: '💳' },
            { id: 'notifications', label: 'Notifications', icon: '🔔' },
        ];

        return (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Compact Header */}
                <div className="mb-6 flex items-center gap-4">
                    <img
                        src={oauthProfile?.image || (currentUser as any)?.avatar || profileUser.profilePictureUrl || `https://ui-avatars.com/api/?name=${profileUser.name}&background=3B82F6&color=fff`}
                        alt={profileUser.name}
                        className="w-16 h-16 rounded-full border-4 border-white dark:border-gray-700 shadow-lg object-cover"
                    />
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{profileUser.name}</h1>
                        <p className="text-gray-500 dark:text-gray-400">
                            {profileUser.city && profileUser.state ? `${profileUser.city}, ${profileUser.state}` : 'Location not set'} • Member for {accountAgeString}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full text-sm font-medium">
                            ⭐ {profileUser.rating || 0}
                        </span>
                        <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                            🛡️ {profileUser.valuationReputationScore}
                        </span>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="flex gap-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
                                    }`}
                            >
                                <span className="mr-2">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{completedTrades.length}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Trades</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{profileUser.inventory.length}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Items</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalInventoryValue)}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Collection</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{accountAgeString}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Member</p>
                                </div>
                            </div>

                            {/* Collection Stats */}
                            <CollectionStats items={profileUser.inventory} />

                            {/* Trade-Up Journey */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">📈 Your Trade-Up Journey</h3>
                                <TradeJourneyTimeline
                                    trades={completedTrades}
                                    userId={String(profileUser.id)}
                                    allItems={allItems}
                                    onTradeClick={(tradeId) => navigate(`/trades?highlight=${tradeId}`)}
                                />
                            </div>

                            {/* About */}
                            {profileUser.aboutMe && (
                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">About</h3>
                                    <p className="text-gray-600 dark:text-gray-300">{profileUser.aboutMe}</p>
                                </div>
                            )}

                            {/* Quick Links */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <Link
                                    to="/inventory"
                                    className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors"
                                >
                                    <span className="text-2xl">📦</span>
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">Manage Inventory</span>
                                </Link>
                                <Link
                                    to="/analytics"
                                    className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors"
                                >
                                    <span className="text-2xl">📊</span>
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">View Analytics</span>
                                </Link>
                                <Link
                                    to="/trades"
                                    className="flex items-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors"
                                >
                                    <span className="text-2xl">🔄</span>
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">Active Trades</span>
                                </Link>
                            </div>
                        </div>
                    )}

                    {activeTab === 'account' && (
                        <AccountSection user={profileUser} onUpdate={handleProfileUpdate} />
                    )}

                    {activeTab === 'payments' && (
                        <PaymentMethodsSection userId={profileUser.id} />
                    )}

                    {activeTab === 'notifications' && (
                        <div className="max-w-2xl">
                            <EmailPreferencesSettings />
                        </div>
                    )}
                </div>

                {/* Edit Profile Modal */}
                <EditProfileModal
                    show={showEditModal}
                    onClose={() => setShowEditModal(false)}
                    user={profileUser}
                    onSave={(updatedUser) => {
                        setProfileUser(updatedUser);
                    }}
                />
            </div>
        );
    }

    // ===========================================
    // EXTERNAL-VIEW: Another Trader's Profile
    // ===========================================
    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Trust Header */}
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-sky-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <img
                        src={profileUser.profilePictureUrl || `https://ui-avatars.com/api/?name=${profileUser.name}&background=3B82F6&color=fff`}
                        alt={profileUser.name}
                        className="w-20 h-20 rounded-full border-4 border-white dark:border-gray-600 shadow-lg"
                    />
                    <div className="flex-1">
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">
                            {profileUser.name}
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">
                            {profileUser.city}, {profileUser.state} • Member for {accountAgeString}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full text-sm font-medium">
                                ⭐ {profileUser.rating || 0} rating
                            </span>
                            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                                🛡️ {profileUser.valuationReputationScore} reputation
                            </span>
                            <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                                ✅ {completedTrades.length} trades completed
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate(`/trade-desk/${profileUser.id}`)}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-lg hover:shadow-xl"
                    >
                        🤝 Start Trade
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-1 space-y-6">
                    {/* About */}
                    {profileUser.aboutMe && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="font-semibold text-gray-800 dark:text-white mb-2">About</h3>
                            <p className="text-gray-600 dark:text-gray-300 text-sm">{profileUser.aboutMe}</p>
                        </div>
                    )}

                    {/* Trust Signals */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Trust Signals</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Response Time</span>
                                <span className="text-green-600 dark:text-green-400 font-medium text-sm">Usually &lt; 1 hour</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Dispute Rate</span>
                                <span className="text-green-600 dark:text-green-400 font-medium text-sm">0%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Trades Completed</span>
                                <span className="font-medium text-gray-800 dark:text-white text-sm">{completedTrades.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400 text-sm">Inventory Value</span>
                                <span className="font-medium text-gray-800 dark:text-white text-sm">{formatCurrency(totalInventoryValue)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Your History with This Trader */}
                    {tradesWith.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Your History Together</h3>
                            <div className="space-y-2">
                                {tradesWith.slice(0, 3).map(trade => (
                                    <div key={trade.id} className="flex justify-between items-center text-sm">
                                        <span className="text-gray-600 dark:text-gray-400">
                                            {new Date(trade.createdAt).toLocaleDateString()}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${trade.status === TradeStatus.COMPLETED
                                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                            }`}>
                                            {trade.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Featured Items */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Featured Items</h3>
                            {profileUser.inventory.length > 4 && (
                                <button
                                    onClick={() => setShowAllItems(true)}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                                >
                                    View All {profileUser.inventory.length} Items →
                                </button>
                            )}
                        </div>
                        {featuredItems.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {featuredItems.map(item => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        onViewValuation={() => {
                                            setSelectedItem(item);
                                            setShowValuationModal(true);
                                        }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <p className="text-4xl mb-2">📦</p>
                                <p>No items in inventory yet</p>
                            </div>
                        )}
                    </div>

                    {/* Recent Reviews Placeholder */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Reviews</h3>
                        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                            <p className="text-3xl mb-2">⭐</p>
                            <p className="text-sm">No reviews yet. Be the first to trade with {profileUser.name}!</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* All Items Modal */}
            {showAllItems && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                                {profileUser.name}'s Full Inventory ({profileUser.inventory.length} items)
                            </h3>
                            <button
                                onClick={() => setShowAllItems(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {profileUser.inventory.map(item => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        onViewValuation={() => {
                                            setShowAllItems(false);
                                            setSelectedItem(item);
                                            setShowValuationModal(true);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Valuation Modal */}
            <ItemValuationModal
                show={showValuationModal}
                onClose={() => {
                    setShowValuationModal(false);
                    setSelectedItem(null);
                }}
                item={selectedItem}
            />
        </div>
    );
};

export default ProfilePage;
