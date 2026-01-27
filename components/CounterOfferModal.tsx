import React, { useState } from 'react';
import { Trade, User, Item } from '../types.ts';
import { submitCounterOffer } from '../api/api.ts';
import { formatCurrency } from '../utils/currency.ts';

interface CounterOfferModalProps {
    isOpen: boolean;
    onClose: () => void;
    trade: Trade;
    currentUser: User;
    otherUser: User;
    allItems: Map<string, Item>;
    onCounterSubmitted: () => void;
}

const CounterOfferModal: React.FC<CounterOfferModalProps> = ({
    isOpen,
    onClose,
    trade,
    currentUser,
    otherUser,
    allItems,
    onCounterSubmitted
}) => {
    // Current user is the receiver of the original trade, so they become the proposer of the counter
    // Their items (what they'll give) = items from their inventory
    // Other user items (what they want) = items from original proposer's inventory

    const [selectedYourItems, setSelectedYourItems] = useState<string[]>([]);
    const [selectedTheirItems, setSelectedTheirItems] = useState<string[]>([]);
    const [yourCash, setYourCash] = useState(0);
    const [theirCash, setTheirCash] = useState(0);
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setError(null);

        if (selectedYourItems.length === 0 && yourCash === 0 && selectedTheirItems.length === 0 && theirCash === 0) {
            setError('Please select at least some items or cash for your counter-offer');
            return;
        }

        setIsSubmitting(true);
        try {
            await submitCounterOffer(trade.id, currentUser.id, {
                proposerItemIds: selectedYourItems,
                receiverItemIds: selectedTheirItems,
                proposerCash: yourCash,
                receiverCash: theirCash,
                message: message || undefined
            });
            onCounterSubmitted();
            onClose();
        } catch (err) {
            setError('Failed to submit counter-offer');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleItem = (itemId: string, type: 'yours' | 'theirs') => {
        if (type === 'yours') {
            setSelectedYourItems(prev =>
                prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
            );
        } else {
            setSelectedTheirItems(prev =>
                prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
            );
        }
    };

    // Get items available for selection
    const yourInventory = currentUser.inventory || [];
    const theirInventory = otherUser.inventory || [];

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Make a Counter-Offer</h3>
                                <p className="text-orange-100 text-sm">Propose different terms to {otherUser.name}</p>
                            </div>
                            <button onClick={onClose} className="text-white hover:text-orange-200 text-2xl leading-none">&times;</button>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="px-6 pt-4">
                        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-100">
                            <span className="text-2xl">🤝</span>
                            <div>
                                <h4 className="font-semibold text-gray-800">How it works</h4>
                                <p className="text-sm text-gray-600 mt-1">
                                    Select items you want to offer and items you want in return.
                                    Add cash to either side to balance the deal. The original trade will be marked as "countered."
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Item Selection */}
                    <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
                        {/* Your items */}
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-2">What You'll Give:</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {yourInventory.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => toggleItem(item.id, 'yours')}
                                        className={`p-2 rounded-lg border-2 text-left transition-all ${selectedYourItems.includes(item.id)
                                            ? 'border-orange-500 bg-orange-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <p className="text-xs font-medium truncate">{item.name}</p>
                                        <p className="text-xs text-gray-500">{formatCurrency(item.estimatedMarketValue || 0)}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-sm text-gray-600">+ Cash:</span>
                                <span className="text-gray-500">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={yourCash || ''}
                                    onChange={e => setYourCash(Math.round(Math.max(0, parseFloat(e.target.value) || 0) * 100) / 100)}
                                    className="w-24 px-2 py-1 border rounded text-sm"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Their items */}
                        <div>
                            <h4 className="font-semibold text-gray-700 mb-2">What You Want from {otherUser.name}:</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {theirInventory.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => toggleItem(item.id, 'theirs')}
                                        className={`p-2 rounded-lg border-2 text-left transition-all ${selectedTheirItems.includes(item.id)
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <p className="text-xs font-medium truncate">{item.name}</p>
                                        <p className="text-xs text-gray-500">{formatCurrency(item.estimatedMarketValue || 0)}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-sm text-gray-600">+ Cash from them:</span>
                                <span className="text-gray-500">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={theirCash || ''}
                                    onChange={e => setTheirCash(Math.round(Math.max(0, parseFloat(e.target.value) || 0) * 100) / 100)}
                                    className="w-24 px-2 py-1 border rounded text-sm"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Message */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Explain your counter-offer..."
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Counter-Offer'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CounterOfferModal;
