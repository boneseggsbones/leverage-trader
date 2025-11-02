import React from 'react';
import { useAuth } from '../context/AuthContext';
import ItemCard from './ItemCard.tsx';

const InventoryPage: React.FC = () => {
    const { currentUser } = useAuth();

    if (!currentUser) return null;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Your Inventory</h1>
            {currentUser.inventory.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {currentUser.inventory.map(item => (
                        <ItemCard 
                            key={item.id} 
                            item={item}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-700">Your inventory is empty.</h3>
                    <p className="text-gray-500 mt-2">Start a trade to acquire new items!</p>
                </div>
            )}
        </div>
    );
};

export default InventoryPage;
