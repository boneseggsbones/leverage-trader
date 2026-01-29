import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ItemCard from './ItemCard.tsx';
import AddItemModal from './AddItemModal.tsx';
import ItemDetailModal from './ItemDetailModal.tsx';
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
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'value-high' | 'value-low' | 'newest'>('value-high');
    const [conditionFilter, setConditionFilter] = useState<string>('all');

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

    const handleAddItem = (item: { name: string; description: string; image: File | null; condition: string; category: string }) => {
        if (currentUser) {
            const formData = new FormData();
            formData.append('name', item.name);
            formData.append('description', item.description);
            if (item.image) {
                formData.append('image', item.image);
            }
            formData.append('owner_id', currentUser.id);
            formData.append('condition', item.condition);
            if (item.category) {
                formData.append('category', item.category);
            }

            fetch('http://localhost:4000/api/items', {
                method: 'POST',
                body: formData,
            })
                .then(response => response.json())
                .then((newItem) => {
                    setShowAddItemModal(false);
                    fetchItems();
                    fetchUser(currentUser.id).then(user => updateUser(user)).catch(err => console.error('Failed to refresh user after add:', err));
                    // Auto-open the detail modal for the newly created item
                    if (newItem && newItem.id) {
                        setSelectedItem(newItem);
                        setShowDetailModal(true);
                    }
                })
                .catch(err => console.error('Error adding item:', err));
        }
    };

    const handleEditItem = async (item: { name: string; description: string; image: File | null, estimatedMarketValueDollars?: number, condition?: string }) => {
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
            if (item.condition) {
                formData.append('condition', item.condition);
            }

            try {
                await fetch(`http://localhost:4000/api/items/${selectedItem.id}`, {
                    method: 'PUT',
                    body: formData,
                });
                fetchItems();
                fetchUser(currentUser!.id).then(user => updateUser(user)).catch(err => console.error('Failed to refresh user after edit:', err));
            } catch (err) {
                console.error('Error editing item:', err);
            }
        }
    };

    const handleDeleteItem = (itemId: number) => {
        fetch(`http://localhost:4000/api/items/${itemId}`, {
            method: 'DELETE',
        })
            .then(() => {
                fetchItems();
                setShowDetailModal(false);
                setSelectedItem(null);
            })
            .catch(err => console.error('Error deleting item:', err));
    };

    const openDetailModal = (item: Item) => {
        setSelectedItem(item);
        setShowDetailModal(true);
    };

    // Filter and sort items
    const filteredItems = items
        .filter(item => {
            // Search filter
            if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            // Condition filter
            if (conditionFilter !== 'all') {
                const itemCondition = (item as any).condition || 'GOOD';
                if (conditionFilter === 'graded' && itemCondition !== 'GRADED') return false;
                if (conditionFilter === 'ungraded' && itemCondition === 'GRADED') return false;
            }
            return true;
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'value-high':
                    return (b.estimatedMarketValue || 0) - (a.estimatedMarketValue || 0);
                case 'value-low':
                    return (a.estimatedMarketValue || 0) - (b.estimatedMarketValue || 0);
                case 'newest':
                    return new Date((b as any).createdAt || 0).getTime() - new Date((a as any).createdAt || 0).getTime();
                default:
                    return 0;
            }
        });

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
                                Manage your collection here. Click any item to view details, edit, or set prices.
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Link
                            to="/import/ebay"
                            className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-md transition-all duration-200 transform hover:scale-105 flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                            Import from eBay
                        </Link>
                        <button onClick={() => setShowAddItemModal(true)} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-md transition-all duration-200 transform hover:scale-105">
                            + Add Item
                        </button>
                    </div>
                </div>
            </div>

            {/* Search and Filter Bar */}
            {items.length > 0 && (
                <div className="mb-6 flex flex-col sm:flex-row gap-3">
                    {/* Search Input */}
                    <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                        <input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        />
                    </div>
                    {/* Sort Dropdown */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="value-high">💰 Highest Value</option>
                        <option value="value-low">💰 Lowest Value</option>
                        <option value="name">🔤 Name A-Z</option>
                        <option value="newest">📅 Newest</option>
                    </select>
                    {/* Condition Filter */}
                    <select
                        value={conditionFilter}
                        onChange={e => setConditionFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="all">All Conditions</option>
                        <option value="graded">🏆 Graded Only</option>
                        <option value="ungraded">📦 Ungraded Only</option>
                    </select>
                </div>
            )}

            <AddItemModal
                show={showAddItemModal}
                onClose={() => setShowAddItemModal(false)}
                onAddItem={handleAddItem}
            />

            <ItemDetailModal
                show={showDetailModal}
                onClose={() => {
                    setShowDetailModal(false);
                    setSelectedItem(null);
                }}
                item={selectedItem}
                onItemUpdated={fetchItems}
                onDeleteItem={handleDeleteItem}
                onEditItem={handleEditItem}
            />

            {filteredItems.length > 0 ? (
                <>
                    {searchQuery && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Showing {filteredItems.length} of {items.length} items
                        </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {filteredItems.map(item => (
                            <ItemCard
                                key={item.id}
                                item={item}
                                onClick={() => openDetailModal(item)}
                                onDelete={() => handleDeleteItem(item.id)}
                            />
                        ))}
                    </div>
                </>
            ) : items.length > 0 ? (
                <div className="text-center py-12">
                    <p className="text-4xl mb-3">🔍</p>
                    <p className="text-gray-500 dark:text-gray-400">No items match your search</p>
                    <button
                        onClick={() => { setSearchQuery(''); setConditionFilter('all'); }}
                        className="mt-3 text-emerald-600 hover:underline"
                    >
                        Clear filters
                    </button>
                </div>
            ) : (
                <EmptyInventory onAddItem={() => setShowAddItemModal(true)} />
            )}
        </div>
    );
};

export default InventoryPage;
