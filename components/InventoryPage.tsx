import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import ItemCard from './ItemCard.tsx';
import AddItemModal from './AddItemModal.tsx';
import EditItemModal from './EditItemModal.tsx';
import { Item } from '../types';

const InventoryPage: React.FC = () => {
    const { currentUser } = useAuth();
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddItemModal, setShowAddItemModal] = useState(false);
    const [showEditItemModal, setShowEditItemModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    const fetchItems = () => {
        if (currentUser) {
            setLoading(true);
            fetch(`http://localhost:4000/api/items?userId=${currentUser.id}`)
                .then(res => res.json())
                .then(data => {
                    setItems(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Error fetching items:', err);
                    setLoading(false);
                });
        }
    };

    useEffect(() => {
        fetchItems();
    }, [currentUser]);

    const handleAddItem = (item: { name: string; description: string }) => {
        if (currentUser) {
            fetch('http://localhost:4000/api/items', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...item, owner_id: currentUser.id }),
            })
                .then(() => {
                    setShowAddItemModal(false);
                    fetchItems();
                })
                .catch(err => console.error('Error adding item:', err));
        }
    };

    const handleEditItem = (item: { name: string; description: string }) => {
        if (selectedItem) {
            fetch(`http://localhost:4000/api/items/${selectedItem.id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(item),
            })
                .then(() => {
                    setShowEditItemModal(false);
                    setSelectedItem(null);
                    fetchItems();
                })
                .catch(err => console.error('Error editing item:', err));
        }
    };

    const openEditModal = (item: Item) => {
        setSelectedItem(item);
        setShowEditItemModal(true);
    };

    const handleDeleteItem = (itemId: number) => {
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
        return <div>Loading...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Your Inventory</h1>
                <button onClick={() => setShowAddItemModal(true)} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Add Item
                </button>
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
            {items.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {items.map(item => (
                        <ItemCard 
                            key={item.id} 
                            item={item}
                            onEdit={() => openEditModal(item)}
                            onDelete={() => handleDeleteItem(item.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-700">Your inventory is empty.</h3>
                    <p className="text-gray-500 mt-2">Click "Add Item" to get started.</p>
                </div>
            )}
        </div>
    );
};

export default InventoryPage;
