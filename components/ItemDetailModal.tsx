import React from 'react';
import { Item } from '../types.ts';
import { formatCurrency, formatCurrencyOptional } from '../utils/currency.ts';
import ValuationBadge from './ValuationBadge.tsx';

interface ItemDetailModalProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onAddToTrade?: () => void;
    isInTrade?: boolean;
    actionLabel?: string;
}

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
    item,
    isOpen,
    onClose,
    onAddToTrade,
    isInTrade = false,
    actionLabel = 'Add to Trade'
}) => {
    if (!isOpen || !item) return null;

    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/')
        ? `http://localhost:4000${item.imageUrl}`
        : item.imageUrl;

    const emvSource = (item as any).emv_source || (item as any).emvSource || item.valuationSource;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-slate-600 transition-colors"
                >
                    ✕
                </button>

                {/* Image */}
                <div className="relative w-full h-64 bg-gradient-to-br from-slate-100 to-slate-200">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={item.name}
                            className="w-full h-full object-contain p-4"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-6xl text-slate-300">
                            📦
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Title & Price */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-slate-800">{item.name}</h2>
                            <ValuationBadge source={emvSource} size="sm" />
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-slate-800">
                                {formatCurrencyOptional(item.estimatedMarketValue ?? null)}
                            </div>
                            <span className="text-xs text-slate-500">Est. Market Value</span>
                        </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                        <div className="mb-4">
                            <h3 className="text-sm font-semibold text-slate-600 mb-1">Description</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">{item.description}</p>
                        </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-6">
                        {(item as any).customCategory && (
                            <div className="bg-slate-50 rounded-lg p-3">
                                <span className="text-xs text-slate-500">Category</span>
                                <p className="font-medium text-slate-700">{(item as any).customCategory}</p>
                            </div>
                        )}
                        {item.condition && (
                            <div className="bg-slate-50 rounded-lg p-3">
                                <span className="text-xs text-slate-500">Condition</span>
                                <p className="font-medium text-slate-700">{item.condition}</p>
                            </div>
                        )}
                        {(item as any).pricechartingProductId && (
                            <div className="bg-blue-50 rounded-lg p-3 col-span-2">
                                <span className="text-xs text-blue-600">✓ PriceCharting Linked</span>
                                <p className="text-xs text-blue-700 mt-0.5">Automated market pricing</p>
                            </div>
                        )}
                    </div>

                    {/* Action Button */}
                    {onAddToTrade && (
                        <button
                            onClick={() => {
                                onAddToTrade();
                                onClose();
                            }}
                            className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all ${isInTrade
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:shadow-lg'
                                }`}
                        >
                            {isInTrade ? 'Remove from Trade' : actionLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ItemDetailModal;
