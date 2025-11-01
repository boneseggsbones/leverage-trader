
import React from 'react';
// Fix: Add .tsx extension to module imports
import { Item, User } from '../types.ts';
import ItemCard from './ItemCard.tsx';

interface TradeBalancerProps {
    currentUser: User;
    otherUser: User;
    currentUserItems: Item[];
    otherUserItems: Item[];
    currentUserCash: number;
    otherUserCash: number; // For simplicity, only one party offers cash. Let's assume fromCash.
}

const TradeBalancer: React.FC<TradeBalancerProps> = ({
    currentUser,
    otherUser,
    currentUserItems,
    otherUserItems,
    currentUserCash,
}) => {
    const calculateTotalValue = (items: Item[], cash: number): number => {
        // Fix: Convert cash from dollars to cents to sum with item values which are in cents
        return items.reduce((sum, item) => sum + item.estimatedMarketValue, 0) + (cash * 100);
    };

    const currentUserValue = calculateTotalValue(currentUserItems, currentUserCash);
    const otherUserValue = calculateTotalValue(otherUserItems, 0); // Assuming other user doesn't offer cash in this UI
    const valueDifference = currentUserValue - otherUserValue;

    const renderSide = (user: User, items: Item[], cash: number, value: number, isCurrentUser: boolean) => (
        <div className={`flex-1 p-4 rounded-lg ${isCurrentUser ? 'bg-blue-50' : 'bg-gray-50'}`}>
            <h3 className="font-bold text-lg text-gray-800 mb-4">{isCurrentUser ? "Your Offer" : `${user.name}'s Offer`}</h3>
            <div className="space-y-3 mb-4 min-h-[100px]">
                {items.length === 0 && cash === 0 && (
                    <p className="text-slate-500 text-sm">No items or cash offered.</p>
                )}
                {items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm border border-gray-200">
                        <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover" />
                        <div>
                            <p className="font-semibold text-sm text-gray-800">{item.name}</p>
                            {/* Fix: Display value from cents as dollars. */}
                            <p className="text-xs text-slate-500">${(item.estimatedMarketValue / 100).toLocaleString()}</p>
                        </div>
                    </div>
                ))}
                {cash > 0 && (
                    <div className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm border border-gray-200">
                         <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center font-bold text-green-700 text-lg">$</div>
                        <div>
                            <p className="font-semibold text-sm text-gray-800">Cash Added</p>
                            <p className="text-xs text-slate-500">${cash.toLocaleString()}</p>
                        </div>
                    </div>
                )}
            </div>
            <div className="border-t border-gray-200 pt-3 mt-3">
                <p className="text-sm text-gray-600">Total Value:</p>
                {/* Fix: Display total value from cents as dollars. */}
                <p className="text-2xl font-bold text-gray-800">${(value / 100).toLocaleString()}</p>
            </div>
        </div>
    );

    return (
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-xl font-bold text-center mb-4 text-gray-700">Trade Balancer</h2>
            <div className="flex flex-col md:flex-row gap-4">
                {renderSide(currentUser, currentUserItems, currentUserCash, currentUserValue, true)}
                <div className="flex items-center justify-center p-2">
                    <div className="text-2xl font-bold text-gray-400">↔</div>
                </div>
                {renderSide(otherUser, otherUserItems, 0, otherUserValue, false)}
            </div>
            <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">Value Difference:</p>
                <p className={`text-xl font-bold ${valueDifference === 0 ? 'text-gray-800' : valueDifference > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {/* Fix: Display value difference from cents as dollars. */}
                    {valueDifference > 0 ? `Your offer is higher by $${(Math.abs(valueDifference)/100).toLocaleString()}` :
                     valueDifference < 0 ? `Their offer is higher by $${(Math.abs(valueDifference)/100).toLocaleString()}` :
                     "The trade is balanced"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                    {valueDifference > 0 ? `You are overpaying.` : valueDifference < 0 ? 'You are receiving more value.' : ''}
                </p>
            </div>
        </div>
    );
};

export default TradeBalancer;