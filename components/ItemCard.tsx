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
    onDelete?: () => void;
    onClick?: () => void; // New: unified click handler for opening detail modal
}

const ItemCard: React.FC<ItemCardProps> = ({ item, onSelect, isSelected, isCompact, onDelete, onClick }) => {
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;

    // Get emv_source from item (may be in different formats)
    const emvSource = (item as any).emv_source || (item as any).emvSource || item.valuationSource;

    // Get PSA grade early for compact view
    const psaGrade = (item as any).psa_grade;

    if (isCompact) {
        return (
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="relative">
                    <img src={imageUrl} alt={item.name} className="w-10 h-10 rounded object-cover" />
                    {psaGrade && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1 rounded">
                            {psaGrade}
                        </div>
                    )}
                </div>
                <div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>
                </div>
            </div>
        )
    }

    const cardClasses = `
        group relative border-2 rounded-xl p-3 flex flex-col items-center text-center cursor-pointer transition-all duration-200
        ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 shadow-md' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600'}
    `;

    return (
        <div className={cardClasses} onClick={onClick || onSelect}>
            {/* Delete button - shows on hover */}
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-500/0 hover:bg-red-500 text-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                    title="Delete item"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}

            <div className="relative w-full h-24 bg-gray-100 dark:bg-gray-700 rounded-lg mb-2 overflow-hidden">
                <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" />
                {/* PSA Grade Badge - positioned on image */}
                {psaGrade && (
                    <div className="absolute top-1 right-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        PSA {psaGrade}
                    </div>
                )}
            </div>
            <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate w-full">{item.name}</h4>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{formatCurrencyOptional(item.estimatedMarketValue ?? null)}</p>

            {/* Price difference indicator for user overrides */}
            {emvSource === 'user_override' && (item as any).original_api_value_cents && (
                (() => {
                    const original = (item as any).original_api_value_cents;
                    const current = item.estimatedMarketValue || 0;
                    const diff = current - original;
                    const pct = Math.round((diff / original) * 100);
                    if (Math.abs(pct) < 1) return null;
                    return (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${pct > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {pct > 0 ? '↑' : '↓'} {pct > 0 ? '+' : ''}{pct}% vs API
                        </span>
                    );
                })()
            )}

            {/* Valuation Badge */}
            <div className="mt-1.5">
                <ValuationBadge
                    source={emvSource}
                    condition={item.condition}
                    lastUpdated={(item as any).emv_updated_at}
                    size="sm"
                />
            </div>
        </div>
    );
};

export default ItemCard;
