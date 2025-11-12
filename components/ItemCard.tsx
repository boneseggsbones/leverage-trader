import React from 'react';
// Fix: Add .tsx extension to module imports
import { Item } from '../types.ts';
import { formatCurrencyOptional } from '../utils/currency.ts';

interface ItemCardProps {
    item: Item;
    onSelect?: () => void;
    isSelected?: boolean;
    isCompact?: boolean; // For smaller displays like in the balancer
    onEdit?: () => void;
    onDelete?: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onSelect, isSelected, isCompact, onEdit, onDelete }) => {
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;

    const cardClasses = `
        border-2 rounded-lg p-2 flex flex-col items-center text-center cursor-pointer transition-all duration-200
        ${isSelected ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white hover:shadow-lg'}
        ${isCompact ? 'p-1' : 'p-2'}
    `;

    if (isCompact) {
        return (
             <div className="flex items-center gap-3 bg-white p-2 rounded-md shadow-sm border border-gray-200">
                <img src={imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover" />
                <div>
                    <p className="font-semibold text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
                </div>
            </div>
        )
    }

    return (
        <div className={cardClasses} onClick={onSelect}>
            <div className="w-full h-24 bg-gray-100 rounded-md mb-2 overflow-hidden">
                <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <h4 className="font-bold text-sm text-gray-800 truncate w-full">{item.name}</h4>
            <p className="text-xs text-slate-500">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
            <div className="flex justify-around w-full mt-2">
                <button onClick={onEdit} className="text-xs text-blue-500 hover:underline">Edit</button>
                <button onClick={onDelete} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
        </div>
    );
};

export default ItemCard;
