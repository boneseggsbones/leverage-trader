import React from 'react';
// Fix: Add .tsx extension to module imports
import { Item } from '../types.ts';
import { formatCurrencyOptional } from '../utils/currency.ts';
import ValuationBadge from './ValuationBadge.tsx';

interface ItemCardProps {
    item: Item;
    onSelect?: () => void;
    isSelected?: boolean;
    isCompact?: boolean; // For smaller displays like in the balancer
    onEdit?: () => void;
    onDelete?: () => void;
    onViewValuation?: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onSelect, isSelected, isCompact, onEdit, onDelete, onViewValuation }) => {
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;

    // Get emv_source from item (may be in different formats)
    const emvSource = (item as any).emv_source || (item as any).emvSource || item.valuationSource;

    const cardClasses = `
        border-2 rounded-lg p-2 flex flex-col items-center text-center cursor-pointer transition-all duration-200
        ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 shadow-md' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg'}
        ${isCompact ? 'p-1' : 'p-2'}
    `;

    if (isCompact) {
        return (
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
                <img src={imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover" />
                <div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
                </div>
            </div>
        )
    }

    return (
        <div className={cardClasses} onClick={onSelect}>
            <div className="w-full h-24 bg-gray-100 dark:bg-gray-700 rounded-md mb-2 overflow-hidden">
                <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
            </div>
            <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate w-full">{item.name}</h4>
            <p className="text-xs text-slate-500 dark:text-gray-400">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>

            {/* Valuation Badge */}
            <div className="mt-1">
                <ValuationBadge source={emvSource} size="sm" />
            </div>

            <div className="flex justify-around w-full mt-2 flex-wrap gap-1">
                {onViewValuation && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onViewValuation(); }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                        💰 Value
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onEdit?.(); }} className="text-xs text-blue-500 dark:text-blue-400 hover:underline">Edit</button>
                <button onClick={(e) => { e.stopPropagation(); onDelete?.(); }} className="text-xs text-red-500 dark:text-red-400 hover:underline">Delete</button>
            </div>
        </div>
    );
};

export default ItemCard;

