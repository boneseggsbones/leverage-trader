
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
import WishlistMatches from './WishlistMatches.tsx';
import OnboardingWalkthrough from './OnboardingWalkthrough.tsx';

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

    // Trade matches
    interface TradeMatch {
        userId: number;
        userName: string;
        score: number;
        tier: 'hot' | 'good' | 'explore';
        reasons: { type: string; description: string; score: number }[];
        theirWishlistMatchCount: number;  // Items they have that you want
        yourWishlistMatchCount: number;   // Items you have that they want
        theirWishlistItems: { id: number; name: string }[];  // Items they have that you want
        yourWishlistItems: { id: number; name: string }[];   // Items you have that they want
    }
    const [tradeMatches, setTradeMatches] = useState<TradeMatch[]>([]);

    // Location filtering state
    const [searchCity, setSearchCity] = useState('');
    const [searchState, setSearchState] = useState('');
    const [searchDistance, setSearchDistance] = useState(50);
    const [showLocationPicker, setShowLocationPicker] = useState(false);
    const [locationInput, setLocationInput] = useState('');
    const [resolvedZip, setResolvedZip] = useState<{ city: string; state: string } | null>(null);
    const [zipLookupLoading, setZipLookupLoading] = useState(false);

    // Look up zip codes as user types
    useEffect(() => {
        const lookupZip = async () => {
            if (/^\d{5}$/.test(locationInput)) {
                setZipLookupLoading(true);
                try {
                    const res = await fetch(`http://localhost:4000/api/zipcode/${locationInput}`);
                    if (res.ok) {
                        const data = await res.json();
                        setResolvedZip({ city: data.city, state: data.state });
                    } else {
                        setResolvedZip(null);
                    }
                } catch {
                    setResolvedZip(null);
                }
                setZipLookupLoading(false);
            } else {
                setResolvedZip(null);
            }
        };
        lookupZip();
    }, [locationInput]);

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

                    // Fetch trade matches
                    try {
                        const matchRes = await fetch(`http://localhost:4000/api/users/${currentUser.id}/matches?limit=5`);
                        if (matchRes.ok) {
                            const { matches } = await matchRes.json();
                            setTradeMatches(matches || []);
                        }
                    } catch (matchErr) {
                        console.error('Error fetching matches:', matchErr);
                    }
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

    // Simple fuzzy match - allows for minor typos/differences
    const fuzzyMatch = (text: string, query: string): boolean => {
        const t = text.toLowerCase();
        const q = query.toLowerCase();
        if (t.includes(q)) return true;

        // Check if query is substring with 1-2 char difference
        if (q.length >= 3) {
            // Check each word in text
            const words = t.split(/\s+/);
            for (const word of words) {
                // Simple Levenshtein-like: check if first chars match and length is similar
                if (word.charAt(0) === q.charAt(0) && Math.abs(word.length - q.length) <= 2) {
                    let matches = 0;
                    for (let i = 0; i < Math.min(word.length, q.length); i++) {
                        if (word.charAt(i) === q.charAt(i)) matches++;
                    }
                    if (matches >= q.length * 0.6) return true; // 60% char match
                }
            }
        }
        return false;
    };

    // Filter users based on search (excluding current user) - includes item search
    const filteredUsers = useMemo(() => {
        if (!userSearch.trim()) return [];
        const search = userSearch.toLowerCase().trim();

        return users
            .filter(u => u.id !== currentUser?.id)
            .map(u => {
                // Check name and email
                const nameMatch = fuzzyMatch(u.name, search);
                const emailMatch = (u as any).email ? fuzzyMatch((u as any).email, search) : false;

                // Check inventory items
                const matchingItems = (u.inventory || []).filter(item =>
                    fuzzyMatch(item.name, search)
                );

                return {
                    user: u,
                    nameMatch,
                    emailMatch,
                    matchingItems,
                    hasMatch: nameMatch || emailMatch || matchingItems.length > 0
                };
            })
            .filter(result => result.hasMatch)
            .sort((a, b) => {
                // Prioritize name matches, then email, then item matches
                if (a.nameMatch && !b.nameMatch) return -1;
                if (!a.nameMatch && b.nameMatch) return 1;
                if (a.matchingItems.length > b.matchingItems.length) return -1;
                return 0;
            })
            .slice(0, 8);
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
                <div key={item.id} className="flex-shrink-0 w-64">
                    <DiscoveryItemCard
                        item={item}
                        owner={owner}
                        onClick={() => handleItemClick(owner.id)}
                        isWishlisted={(currentUser.wishlist || []).includes(item.id)}
                        onToggleWishlist={() => handleToggleWishlist(item.id)}
                    />
                </div>
            ) : null;
        });
    };

    return (
        <div className="bg-white dark:bg-gray-900 transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div id="discover-section" className="mb-8 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
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
                                    placeholder="Search traders by name or item..."
                                    className="w-full px-4 py-3 pl-11 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
                                />
                                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">👤</span>

                                {/* Dropdown */}
                                {showUserDropdown && filteredUsers.length > 0 && (
                                    <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-96 overflow-y-auto">
                                        {filteredUsers.map(result => (
                                            <button
                                                key={result.user.id}
                                                onClick={() => {
                                                    navigate(`/trade-desk/${result.user.id}`);
                                                    setUserSearch('');
                                                    setShowUserDropdown(false);
                                                }}
                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                                                    {result.user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 dark:text-white truncate">{result.user.name}</p>
                                                    {result.matchingItems.length > 0 ? (
                                                        <p className="text-xs text-green-600 dark:text-green-400 truncate">
                                                            🎯 Has: {result.matchingItems.slice(0, 2).map(i => i.name).join(', ')}
                                                            {result.matchingItems.length > 2 && ` +${result.matchingItems.length - 2} more`}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                            {(result.user as any).rating ? `★ ${(result.user as any).rating.toFixed(1)}` : 'No ratings'} • {(result.user.inventory || []).length} items
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-blue-500 text-sm font-medium flex-shrink-0">Trade →</span>
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
                    <section id="nearby-finds">
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
                                            <input
                                                type="text"
                                                placeholder="City, State or Zip Code"
                                                value={locationInput}
                                                onChange={e => setLocationInput(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-2"
                                                autoFocus
                                            />

                                            {/* Show resolved zip code location */}
                                            {/^\d{5}$/.test(locationInput) && (
                                                <div className="mb-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                                    {zipLookupLoading ? (
                                                        <p className="text-sm text-gray-500">Looking up...</p>
                                                    ) : resolvedZip ? (
                                                        <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-1">
                                                            ✓ {resolvedZip.city}, {resolvedZip.state}
                                                        </p>
                                                    ) : (
                                                        <p className="text-sm text-red-500">Zip code not found</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Autocomplete suggestions from other traders' locations */}
                                            {locationInput.length >= 2 && !/^\d{5}$/.test(locationInput) && (
                                                <div className="max-h-32 overflow-y-auto mb-2">
                                                    {(() => {
                                                        // Get unique locations from users
                                                        const locations = [...new Set(
                                                            users
                                                                .filter(u => u.city && u.state)
                                                                .map(u => `${u.city}, ${u.state}`)
                                                        )].filter(loc =>
                                                            loc.toLowerCase().includes(locationInput.toLowerCase())
                                                        ).slice(0, 4);

                                                        return locations.map(loc => (
                                                            <button
                                                                key={loc}
                                                                onClick={() => {
                                                                    const [city, state] = loc.split(',').map(s => s.trim());
                                                                    setSearchCity(city);
                                                                    setSearchState(state);
                                                                    setLocationInput('');
                                                                    setShowLocationPicker(false);
                                                                }}
                                                                className="w-full text-left px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                                                            >
                                                                📍 {loc}
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        const input = locationInput.trim();
                                                        // Check if it's a zip code - use resolved city
                                                        if (/^\d{5}$/.test(input) && resolvedZip) {
                                                            setSearchCity(resolvedZip.city);
                                                            setSearchState(resolvedZip.state);
                                                        } else if (input.includes(',')) {
                                                            const [city, state] = input.split(',').map(s => s.trim());
                                                            setSearchCity(city);
                                                            setSearchState(state.toUpperCase());
                                                        } else if (input) {
                                                            setSearchCity(input);
                                                            setSearchState('');
                                                        }
                                                        setLocationInput('');
                                                        setResolvedZip(null);
                                                        setShowLocationPicker(false);
                                                    }}
                                                    disabled={/^\d{5}$/.test(locationInput) && !resolvedZip}
                                                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (currentUser?.city && currentUser?.state) {
                                                            setSearchCity(currentUser.city);
                                                            setSearchState(currentUser.state);
                                                        }
                                                        setLocationInput('');
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

                    {/* Wishlist Matches - Hot Trade Opportunities */}
                    <div id="wishlist-matches">
                        <WishlistMatches userId={currentUser.id} />
                    </div>

                    {/* Trade Matches Section */}
                    {tradeMatches.length > 0 && (
                        <section id="trade-matches">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                                🎯 Trade Matches
                                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                                    Traders who complement your collection
                                </span>
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {tradeMatches.map(match => (
                                    <button
                                        key={match.userId}
                                        onClick={() => navigate(`/trade-desk/${match.userId}`)}
                                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-left hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
                                    >
                                        <div className="flex items-start gap-3 mb-3">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                                                {match.userName.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                                                        {match.userName}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${match.tier === 'hot'
                                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                        : match.tier === 'good'
                                                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                        }`}>
                                                        {match.tier === 'hot' ? '🔥 Hot' : match.tier === 'good' ? '⭐ Good' : '👀 Explore'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${match.score >= 80 ? 'bg-red-500' : match.score >= 50 ? 'bg-yellow-500' : 'bg-blue-500'
                                                                }`}
                                                            style={{ width: `${match.score}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{match.score}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Match Reasons */}
                                        <div className="space-y-1">
                                            {match.reasons.slice(0, 2).map((reason, idx) => (
                                                <p key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                    <span className="text-green-500">✓</span>
                                                    {reason.description}
                                                </p>
                                            ))}
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                            <span className="text-sm text-blue-600 dark:text-blue-400 font-medium group-hover:underline">
                                                View Trade Desk →
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <ItemCarousel title="Recommended For You">
                        {renderCarouselItems(dashboardData.recommendedItems)}
                    </ItemCarousel>

                    <ItemCarousel title="From Top-Rated Traders">
                        {renderCarouselItems(dashboardData.topTraderItems)}
                    </ItemCarousel>
                </div>
            </div>
            <OnboardingModal show={showOnboarding} onClose={closeOnboarding} />
            <OnboardingWalkthrough />
        </div>
    );
};

export default Dashboard;