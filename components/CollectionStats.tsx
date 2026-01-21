import React from 'react';
import { Item } from '../types.ts';
import { formatCurrency } from '../utils/currency.ts';

interface CollectionStatsProps {
    items: Item[];
}

// Group items by their category or a default
const getCategoryBreakdown = (items: Item[]): { category: string; count: number; value: number }[] => {
    const breakdown: Record<string, { count: number; value: number }> = {};

    items.forEach(item => {
        const category = (item as any).category_name || (item as any).categoryName || 'Other';
        if (!breakdown[category]) {
            breakdown[category] = { count: 0, value: 0 };
        }
        breakdown[category].count++;
        breakdown[category].value += item.estimatedMarketValue || 0;
    });

    return Object.entries(breakdown)
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.value - a.value);
};

const CollectionStats: React.FC<CollectionStatsProps> = ({ items }) => {
    const totalValue = items.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0);
    const categoryBreakdown = getCategoryBreakdown(items);
    const itemCount = items.length;

    if (itemCount === 0) {
        return null;
    }

    return (
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold opacity-90">Collection Value</h2>
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                    {itemCount} items
                </span>
            </div>

            {/* Total Value - Hero Number */}
            <div className="text-center mb-6">
                <p className="text-4xl font-bold tracking-tight">
                    {formatCurrency(totalValue)}
                </p>
                <p className="text-sm opacity-70 mt-1">Total Estimated Value</p>
            </div>

            {/* Category Breakdown */}
            {categoryBreakdown.length > 1 && (
                <div className="space-y-3">
                    <p className="text-xs font-medium opacity-70 uppercase tracking-wide">By Category</p>
                    {categoryBreakdown.slice(0, 4).map(({ category, count, value }) => {
                        const percent = totalValue > 0 ? Math.round((value / totalValue) * 100) : 0;
                        return (
                            <div key={category} className="flex items-center gap-3">
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{category}</span>
                                        <span className="opacity-80">{formatCurrency(value)}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-white/60 rounded-full transition-all"
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                                <span className="text-xs opacity-60 w-8 text-right">{count}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-white/20">
                <div className="text-center">
                    <p className="text-2xl font-bold">{formatCurrency(Math.round(totalValue / itemCount))}</p>
                    <p className="text-xs opacity-70">Avg per item</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold">
                        {items.filter(i => (i as any).psa_grade).length}
                    </p>
                    <p className="text-xs opacity-70">Graded items</p>
                </div>
            </div>
        </div>
    );
};

export default CollectionStats;
