
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext.tsx';
import { fetchAllUsers, toggleWishlistItem, fetchDashboardData, fetchUser } from '../api/api';
import { User, Item } from '../types.ts';
import ItemCarousel from './ItemCarousel.tsx';
import DiscoveryItemCard from './DiscoveryItemCard.tsx';
import { DiscoveryCardSkeleton } from './Skeleton.tsx';
import OnboardingModal, { useOnboarding } from './OnboardingModal.tsx';

const Dashboard: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const { showOnboarding, closeOnboarding } = useOnboarding();

    const [users, setUsers] = useState<User[]>([]);
    interface DashboardData {
        nearbyItems: Item[];
        recommendedItems: Item[];
        topTraderItems: Item[];
    }

    const [dashboardData, setDashboardData] = useState<DashboardData>({
        nearbyItems: [],
        recommendedItems: [],
        topTraderItems: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [showUserDropdown, setShowUserDropdown] = useState(false);

    // Location filtering state
    const [searchCity, setSearchCity] = useState('');
    const [searchState, setSearchState] = useState('');
    const [searchDistance, setSearchDistance] = useState(50);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [locationInput, setLocationInput] = useState('');

    useEffect(() => {
        const loadDashboardData = async () => {
            if (currentUser) {
                try {
                    setIsLoading(true);

                    // Initialize location from user profile on first load
                    const city = searchCity || currentUser.city || '';
                    const state = searchState || currentUser.state || '';

                    if (!searchCity && currentUser.city) setSearchCity(currentUser.city);
                    if (!searchState && currentUser.state) setSearchState(currentUser.state);

                    const [usersData, data] = await Promise.all([
                        fetchAllUsers(),
                        fetchDashboardData(city && state ? { city, state, distance: searchDistance } : undefined)
                    ]);
                    setUsers(usersData);
                    setDashboardData(data);
                } catch (err) {
                    setError("Failed to load dashboard data.");
                    console.error(err);
                } finally {
                    setIsLoading(false);
                }
            }
        };

        loadDashboardData();
    }, [currentUser, searchCity, searchState, searchDistance]);

    const handleToggleWishlist = async (itemId: string) => {
        if (!currentUser) return;
        try {
            await toggleWishlistItem(currentUser.id, itemId);
            const updatedUser = await fetchUser(currentUser.id);
            updateUser(updatedUser);
            const isInWishlist = updatedUser.wishlist.includes(itemId);
            addNotification(isInWishlist ? 'Added to wishlist!' : 'Removed from wishlist.', 'success');
        } catch (error) {
            addNotification('Failed to update wishlist.', 'error');
        }
    };

    const handleItemClick = (itemOwnerId: string) => {
        navigate(`/trade-desk/${itemOwnerId}`);
    };

    // Filter users based on search (excluding current user)
    const filteredUsers = useMemo(() => {
        if (!userSearch.trim()) return [];
        const search = userSearch.toLowerCase();
        return users
            .filter(u => u.id !== currentUser?.id)
            .filter(u => u.name.toLowerCase().includes(search) || (u as any).email?.toLowerCase().includes(search))
            .slice(0, 5);
    }, [users, userSearch, currentUser?.id]);

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 transition-colors">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-8 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                        <div className="animate-pulse flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                            <div className="flex-1">
                                <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-1/4 mb-2"></div>
                                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-12">
                        <section>
                            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-40 mb-4"></div>
                            <div className="flex space-x-6 overflow-x-auto pb-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="flex-shrink-0 w-64">
                                        <DiscoveryCardSkeleton />
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section>
                            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-56 mb-4"></div>
                            <div className="flex space-x-6 overflow-x-auto pb-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="flex-shrink-0 w-64">
                                        <DiscoveryCardSkeleton />
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        );
    }
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!currentUser) return null;

    const renderCarouselItems = (items: Item[]) => {
        return items.map(item => {
            const owner = users.find(u => u.id === item.ownerId);
            return owner ? (
                <DiscoveryItemCard
                    key={item.id}
                    item={item}
                    owner={owner}
                    onClick={() => handleItemClick(owner.id)}
                    isWishlisted={(currentUser.wishlist || []).includes(item.id)}
                    onToggleWishlist={() => handleToggleWishlist(item.id)}
                />
            ) : null;
        });
    };

    return (
        <div className="bg-white dark:bg-gray-900 transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                            🔍
                        </div>
                        <div className="flex-1">
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                Discover
                            </h1>
                            <p className="mt-2 text-slate-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                                Browse items from traders in your area and find pieces that match your interests.
                            </p>
                        </div>
                    </div>

                    {/* User Search */}
                    <div className="mt-4 relative">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                                    onFocus={() => setShowUserDropdown(true)}
                                    placeholder="Search traders by name or email..."
                                    className="w-full px-4 py-3 pl-11 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                                />
                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">👤</span>

                                {/* Dropdown */}
                                {showUserDropdown && filteredUsers.length > 0 && (
                                    <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                        {filteredUsers.map(user => (
                                            <button
                                                key={user.id}
                                                onClick={() => {
                                                    navigate(`/trade-desk/${user.id}`);
                                                    setUserSearch('');
                                                    setShowUserDropdown(false);
                                                }}
                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {(user as any).rating ? `★ ${(user as any).rating.toFixed(1)}` : 'No ratings'} • {(user.inventory || []).length} items
                                                    </p>
                                                </div>
                                                <span className="text-blue-500 text-sm font-medium">Trade →</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        {userSearch && filteredUsers.length === 0 && (
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No traders found matching "{userSearch}"</p>
                        )}
                    </div>
                </div>
                <div className="space-y-12">
                    {/* Nearby Finds with Location Controls */}
                    <section>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                📍 Nearby Finds
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Location Picker */}
                                <div className="relative">
                                    <button
                                        onClick={() => setShowLocationPicker(!showLocationPicker)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                    >
                                        <span>📍</span>
                                        <span>{searchCity && searchState ? `${searchCity}, ${searchState}` : 'Set Location'}</span>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    {showLocationPicker && (
                                        <div className="absolute z-50 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Enter Location</p>
                                            <div className="flex gap-2 mb-3">
                                                <input
                                                    type="text"
                                                    placeholder="City"
                                                    value={locationInput.split(',')[0]?.trim() || searchCity}
                                                    onChange={e => setLocationInput(e.target.value + (locationInput.includes(',') ? ',' + locationInput.split(',')[1] : ''))}
                                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="State"
                                                    maxLength={2}
                                                    value={locationInput.split(',')[1]?.trim() || searchState}
                                                    onChange={e => setLocationInput((locationInput.split(',')[0] || searchCity) + ', ' + e.target.value.toUpperCase())}
                                                    className="w-16 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm uppercase"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        const parts = locationInput.split(',').map(s => s.trim());
                                                        if (parts[0]) setSearchCity(parts[0]);
                                                        if (parts[1]) setSearchState(parts[1].toUpperCase());
                                                        setShowLocationPicker(false);
                                                    }}
                                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (currentUser?.city && currentUser?.state) {
                                                            setSearchCity(currentUser.city);
                                                            setSearchState(currentUser.state);
                                                        }
                                                        setShowLocationPicker(false);
                                                    }}
                                                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Distance Selector */}
                                <select
                                    value={searchDistance}
                                    onChange={e => setSearchDistance(Number(e.target.value))}
                                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium border-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    <option value={10}>Within 10 mi</option>
                                    <option value={25}>Within 25 mi</option>
                                    <option value={50}>Within 50 mi</option>
                                    <option value={100}>Within 100 mi</option>
                                    <option value={250}>Any Distance</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex space-x-6 overflow-x-auto pb-4 scrollbar-hide">
                            {dashboardData.nearbyItems.length > 0 ? (
                                renderCarouselItems(dashboardData.nearbyItems)
                            ) : (
                                <div className="w-full py-12 text-center text-gray-500 dark:text-gray-400">
                                    <p className="text-4xl mb-2">🔍</p>
                                    <p>No items found near {searchCity}, {searchState}</p>
                                    <p className="text-sm mt-1">Try increasing the distance or changing location</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <ItemCarousel title="Recommended For You">
                        {renderCarouselItems(dashboardData.recommendedItems)}
                    </ItemCarousel>

                    <ItemCarousel title="From Top-Rated Traders">
                        {renderCarouselItems(dashboardData.topTraderItems)}
                    </ItemCarousel>
                </div>
            </div>
            <OnboardingModal show={showOnboarding} onClose={closeOnboarding} />
        </div>
    );
};

export default Dashboard;