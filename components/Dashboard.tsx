
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext.tsx';
import { fetchAllUsers, toggleWishlistItem, fetchDashboardData, fetchUser } from '../api/api';
import { User, Item } from '../types.ts';
import ItemCarousel from './ItemCarousel.tsx';
import DiscoveryItemCard from './DiscoveryItemCard.tsx';

const Dashboard: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { addNotification } = useNotification();

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

    useEffect(() => {
        const loadDashboardData = async () => {
            if (currentUser) {
                try {
                    setIsLoading(true);
                    const [usersData, data] = await Promise.all([
                        fetchAllUsers(),
                        fetchDashboardData()
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
    }, [currentUser]);

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

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading Discovery...</div>;
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
        <div className="bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl p-6 border border-slate-200 shadow-sm">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                            🔍
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                                Discover
                            </h1>
                            <p className="mt-2 text-slate-600 leading-relaxed max-w-2xl">
                                Browse items from traders in your area and find pieces that match your interests.
                                Click any item to visit their trade desk and propose a swap.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="space-y-12">
                    <ItemCarousel title="Nearby Finds">
                        {renderCarouselItems(dashboardData.nearbyItems)}
                    </ItemCarousel>

                    <ItemCarousel title="Recommended For You">
                        {renderCarouselItems(dashboardData.recommendedItems)}
                    </ItemCarousel>

                    <ItemCarousel title="From Top-Rated Traders">
                        {renderCarouselItems(dashboardData.topTraderItems)}
                    </ItemCarousel>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;