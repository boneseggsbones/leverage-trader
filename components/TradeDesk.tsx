
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
// Fix: Add .tsx extension to module imports
import { fetchUser, proposeTrade } from '../api/api';
import { User, Item } from '../types.ts';
import ItemCard from './ItemCard.tsx';
// Fix: Add .tsx extension to local component imports
import TradeBalancer from './TradeBalancer.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import { formatCurrency, dollarsToCents } from '../utils/currency.ts';

const TradeDesk: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { otherUserId } = useParams<{ otherUserId: string }>();
    const { addNotification } = useNotification();

    const [otherUser, setOtherUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Trade state
    const [currentUserItems, setCurrentUserItems] = useState<Item[]>([]);
    const [otherUserItems, setOtherUserItems] = useState<Item[]>([]);
    const [currentUserCash, setCurrentUserCash] = useState<number>(0); // This is in DOLLARS
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (!otherUserId) {
            setError("No user selected for trade. Please go back to the dashboard.");
            setIsLoading(false);
            return;
        }
        
        const loadOtherUser = async () => {
            try {
                const userId = parseInt(otherUserId, 10);
                if (isNaN(userId)) {
                    setError("Invalid user ID.");
                    return;
                }
                const user = await fetchUser(userId);
                if (user) {
                    setOtherUser(user);
                } else {
                    setError("Could not find the user to trade with.");
                }
            } catch (err) {
                setError("Failed to load user data.");
            } finally {
                setIsLoading(false);
            }
        };

        loadOtherUser();
    }, [otherUserId]);
    
    if (!currentUser) {
        navigate('/');
        return null;
    }
    
    const toggleItemSelection = (item: Item, party: 'current' | 'other') => {
        if (party === 'current') {
            setCurrentUserItems(prev => 
                prev.find(i => i.id === item.id) 
                    ? prev.filter(i => i.id !== item.id) 
                    : [...prev, item]
            );
        } else {
            setOtherUserItems(prev => 
                prev.find(i => i.id === item.id) 
                    ? prev.filter(i => i.id !== item.id) 
                    : [...prev, item]
            );
        }
    };

    const handleProposeTrade = async () => {
        if (!otherUser || isSubmitting || !currentUser) return;

        if (currentUserItems.length === 0 && currentUserCash === 0) {
            addNotification("You must offer at least one item or some cash.", 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            // Fix: Pass user IDs and item IDs to the proposeTrade function, not the full objects.
            const { updatedProposer } = await proposeTrade(
                currentUser.id,
                otherUser.id,
                currentUserItems.map(item => item.id),
                otherUserItems.map(item => item.id),
                dollarsToCents(currentUserCash) // Convert dollars to cents for API
            );
            
            // Fix: Use authoritative user object from API response to update context
            updateUser(updatedProposer);

            addNotification("Trade proposed successfully!", 'success');
            navigate('/');
        } catch (err) {
            addNotification("Failed to propose trade. Please try again.", 'error');
            console.error(err);
        } finally {
            setIsSubmitting(false);
            setIsModalOpen(false);
        }
    };
    
    const renderInventory = (title: string, user: User, selectedItems: Item[], onSelect: (item: Item) => void) => (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h3 className="text-xl font-bold text-gray-700 mb-4">{title}</h3>
            {user.inventory.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {user.inventory.map(item => (
                        <ItemCard 
                            key={item.id} 
                            item={item}
                            onSelect={() => onSelect(item)}
                            isSelected={!!selectedItems.find(i => i.id === item.id)}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-slate-500">No items in inventory.</p>
            )}
        </div>
    );
    
    if (isLoading) return <div className="p-8 text-center">Loading Trade Desk...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!otherUser) return <div className="p-8 text-center text-red-500">Could not load trade partner.</div>;
    
    const currentUserCashInDollars = currentUser.cash / 100;

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Trade with {otherUser.name}</h1>
                        <p className="text-slate-500 mt-1">Select items from both inventories and add cash to propose a trade.</p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors self-start"
                    >
                        Cancel Trade
                    </button>
                </div>

                <div className="space-y-8">
                    <TradeBalancer 
                        currentUser={currentUser}
                        otherUser={otherUser}
                        currentUserItems={currentUserItems}
                        otherUserItems={otherUserItems}
                        currentUserCash={currentUserCash}
                        otherUserCash={0} // Assuming only current user adds cash in this UI
                    />
                    
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 space-y-4">
                        <h3 className="text-xl font-bold text-gray-700">Add Cash to Your Offer</h3>
                        <div className="flex items-center gap-4">
                            <span className="text-lg font-semibold text-gray-600">$</span>
                            <input 
                                type="number"
                                value={currentUserCash}
                                onChange={(e) => setCurrentUserCash(Math.max(0, parseInt(e.target.value) || 0))}
                                onBlur={(e) => {
                                    // Fix: Compare dollar values for validation.
                                    if (parseInt(e.target.value) > currentUserCashInDollars) {
                                        setCurrentUserCash(currentUserCashInDollars);
                                        // Fix: Correctly display available cash in dollars.
                                        addNotification(`You only have ${formatCurrency(currentUser.cash)} available.`, 'warning');
                                    }
                                }}
                                className="w-full max-w-xs p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                placeholder="0"
                                min="0"
                                // Fix: Set max attribute to the dollar amount.
                                max={currentUserCashInDollars}
                            />
                            {/* Fix: Display user's available cash in dollars. */}
                            <span className="text-sm text-slate-500">/ {formatCurrency(currentUser.cash)} available</span>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {renderInventory("Your Inventory", currentUser, currentUserItems, (item) => toggleItemSelection(item, 'current'))}
                        {renderInventory(`${otherUser.name}'s Inventory`, otherUser, otherUserItems, (item) => toggleItemSelection(item, 'other'))}
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            disabled={isSubmitting || (currentUserItems.length === 0 && currentUserCash === 0)}
                            className="px-8 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                           {isSubmitting ? "Submitting..." : "Propose Trade"}
                        </button>
                    </div>
                </div>
            </div>
            <ConfirmationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleProposeTrade}
                title="Confirm Trade Proposal"
                confirmButtonText="Yes, Propose Trade"
                confirmButtonClass="bg-blue-600 hover:bg-blue-700"
            >
                Are you sure you want to propose this trade to {otherUser.name}?
            </ConfirmationModal>
        </div>
    );
};

export default TradeDesk;