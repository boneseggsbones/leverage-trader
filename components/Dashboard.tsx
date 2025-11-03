import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext.tsx';
import { fetchAllUsers, toggleWishlistItem, fetchDashboardData, DashboardData } from '../api/mockApi.ts';
import { User, Item } from '../types.ts';
import ItemCarousel from './ItemCarousel.tsx';
import DiscoveryItemCard from './DiscoveryItemCard.tsx';

const Dashboard: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();

    const [users, setUsers] = useState<User[]>([]);
    const [dashboardData, setDashboardData] = useState<DashboardData>({
        nearbyItems: [],
        recommendedItems: [],
        topTraderItems: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }

        const loadDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch pre-filtered data from the new endpoint and all users for display purposes
                const [data, allUsers] = await Promise.all([
                    fetchDashboardData(currentUser.id),
                    fetchAllUsers()
                ]);
                setDashboardData(data);
                setUsers(allUsers);
            } catch (err) {
                setError("Failed to load discovery data.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadDashboardData();
    }, [currentUser, navigateTo]);
    
    const handleToggleWishlist = async (itemId: string) => {
        if (!currentUser) return;
        try {
            const updatedUser = await toggleWishlistItem(currentUser.id, itemId);
            updateUser(updatedUser); // Update user in global context
             const isInWishlist = updatedUser.wishlist.includes(itemId);
            addNotification(isInWishlist ? 'Added to wishlist!' : 'Removed from wishlist.', 'success');
        } catch (error) {
            addNotification('Failed to update wishlist.', 'error');
        }
    };

    const handleItemClick = (itemOwnerId: string) => {
        navigateTo('trade-desk', { otherUserId: itemOwnerId });
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
                    isWishlisted={currentUser.wishlist.includes(item.id)}
                    onToggleWishlist={() => handleToggleWishlist(item.id)}
                />
            ) : null;
        });
    };

    return (
        <div className="bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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