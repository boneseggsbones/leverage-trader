import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext';
import { fetchAllItems, fetchAllUsers, toggleWishlistItem } from '../api/mockApi.ts';
import { Item, User } from '../types.ts';
import DiscoveryItemCard from './DiscoveryItemCard.tsx';

const WishlistPage: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();
    
    const [allItems, setAllItems] = useState<Item[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [items, usersData] = await Promise.all([fetchAllItems(), fetchAllUsers()]);
                setAllItems(items);
                setUsers(usersData);
            } catch (err) {
                setError("Failed to load wishlist items.");
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const wishlistedItems = useMemo(() => {
        if (!currentUser) return [];
        return allItems.filter(item => currentUser.wishlist.includes(item.id));
    }, [currentUser, allItems]);

    const handleToggleWishlist = async (itemId: string) => {
        if (!currentUser) return;
        try {
            const updatedUser = await toggleWishlistItem(currentUser.id, itemId);
            updateUser(updatedUser);
            addNotification('Removed from wishlist.', 'success');
        } catch (error) {
            addNotification('Failed to update wishlist.', 'error');
        }
    };
    
    const handleItemClick = (itemOwnerId: string) => {
        navigateTo('trade-desk', { otherUserId: itemOwnerId });
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500">Loading Wishlist...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!currentUser) return null;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Your Wishlist</h1>
            {wishlistedItems.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {wishlistedItems.map(item => {
                         const owner = users.find(u => u.id === item.ownerId);
                         return owner ? (
                             <DiscoveryItemCard
                                key={item.id}
                                item={item}
                                owner={owner}
                                onClick={() => handleItemClick(owner.id)}
                                isWishlisted={true} // Always true on this page
                                onToggleWishlist={() => handleToggleWishlist(item.id)}
                            />
                         ) : null;
                    })}
                </div>
            ) : (
                <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-700">Your wishlist is empty.</h3>
                    <p className="text-gray-500 mt-2">Click the heart on an item in the Discover page to add it.</p>
                </div>
            )}
        </div>
    );
};

export default WishlistPage;
