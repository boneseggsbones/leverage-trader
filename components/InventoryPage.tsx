import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ItemCard from './ItemCard.tsx';
import AddItemModal from './AddItemModal.tsx';
import EditItemModal from './EditItemModal.tsx';
import ItemValuationModal from './ItemValuationModal.tsx';
import { ItemCardSkeleton } from './Skeleton.tsx';
import { EmptyInventory } from './EmptyState.tsx';
import { Item } from '../types';
import { fetchAllItems, fetchUser } from '../api/api';
import { dollarsToCents } from '../utils/currency.ts';

const InventoryPage: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [showValuationModal, setShowValuationModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    const fetchItems = () => {
        if (currentUser) {
            setLoading(true);
            fetchAllItems(currentUser.id)
                .then(data => {
                    setItems(data);
                })
                .catch(err => {
                    console.error('Error fetching items:', err);
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    };

    useEffect(() => {
        fetchItems();
    }, [currentUser]);

    const handleAddItem = (item: { name: string; description: string; image: File | null }) => {
        // Updated to accept estimatedMarketValueDollars if provided by the modal
        if (currentUser) {
            const formData = new FormData();
            formData.append('name', item.name);
            formData.append('description', item.description);
            if (item.image) {
                formData.append('image', item.image);
            }
            formData.append('owner_id', currentUser.id);
            // If modal supplied an estimatedMarketValue in dollars, convert to cents and send
            if ((item as any).estimatedMarketValueDollars !== undefined) {
                const cents = dollarsToCents((item as any).estimatedMarketValueDollars);
                formData.append('estimatedMarketValue', String(cents));
            }

            fetch('http://localhost:4000/api/items', {
                method: 'POST',
                body: formData,
            })
                .then(() => {
                    setShowAddItemModal(false);
                    fetchItems();
                    fetchUser(currentUser.id).then(user => updateUser(user)).catch(err => console.error('Failed to refresh user after add:', err));
                })
                .catch(err => console.error('Error adding item:', err));
        }
    };

    const handleEditItem = (item: { name: string; description: string; image: File | null, estimatedMarketValueDollars?: number }) => {
        if (selectedItem) {
            const formData = new FormData();
            formData.append('name', item.name);
            formData.append('description', item.description);
            if (item.image) {
                formData.append('image', item.image);
            }
            if (typeof (item as any).estimatedMarketValueDollars === 'number') {
                formData.append('estimatedMarketValue', String(dollarsToCents((item as any).estimatedMarketValueDollars)));
            }

            fetch(`http://localhost:4000/api/items/${selectedItem.id}`,
                {
                    method: 'PUT',
                    body: formData,
                })
                .then(() => {
                    setShowEditItemModal(false);
                    setSelectedItem(null);
                    fetchItems();
                    fetchUser(currentUser.id).then(user => updateUser(user)).catch(err => console.error('Failed to refresh user after edit:', err));
                })
                .catch(err => console.error('Error editing item:', err));
        }
    };

    const openEditModal = (item: Item) => {
        setSelectedItem(item);
        setShowEditItemModal(true);
    };

    const handleDeleteItem = (itemId: string | number) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            fetch(`http://localhost:4000/api/items/${itemId}`, {
                method: 'DELETE',
            })
                .then(() => {
                    fetchItems();
                })
                .catch(err => console.error('Error deleting item:', err));
        }
    };

    if (!currentUser) return null;

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-emerald-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                    <div className="animate-pulse flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                            <div>
                                <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-40 mb-2"></div>
                                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-64"></div>
                            </div>
                        </div>
                        <div className="h-10 bg-gray-300 dark:bg-gray-600 rounded-xl w-28"></div>
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <ItemCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-emerald-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-white shadow-lg text-xl">
                            📦
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                Your Inventory
                            </h1>
                            <p className="mt-2 text-slate-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                                Manage your collection here. Add items you're willing to trade, set valuations,
                                and keep your inventory updated for potential swaps.
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setShowAddItemModal(true)} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-md transition-all duration-200 transform hover:scale-105">
                        + Add Item
                    </button>
                </div>
            </div>
            <AddItemModal
                show={showAddItemModal}
                onClose={() => setShowAddItemModal(false)}
                onAddItem={handleAddItem}
            />
            <EditItemModal
                show={showEditItemModal}
                onClose={() => {
                    setShowEditItemModal(false);
                    setSelectedItem(null);
                }}
                onEditItem={handleEditItem}
                item={selectedItem}
            />
            <ItemValuationModal
                show={showValuationModal}
                onClose={() => {
                    setShowValuationModal(false);
                    setSelectedItem(null);
                }}
                item={selectedItem}
                onValuationUpdated={fetchItems}
            />
            {items.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {items.map(item => (
                        <ItemCard
                            key={item.id}
                            item={item}
                            onEdit={() => openEditModal(item)}
                            onDelete={() => handleDeleteItem(item.id)}
                            onViewValuation={() => {
                                setSelectedItem(item);
                                setShowValuationModal(true);
                            }}
                        />
                    ))}
                </div>
            ) : (
                <EmptyInventory onAddItem={() => setShowAddItemModal(true)} />
            )}
        </div>
    );
};

export default InventoryPage;
