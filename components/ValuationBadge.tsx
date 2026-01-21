import React, { useState } from 'react';

interface ValuationBadgeProps {
    source: string | null | undefined;
    confidence?: number | null;
    size?: 'sm' | 'md';
    itemName?: string;
}

interface SourceConfig {
    label: string;
    bgColor: string;
    textColor: string;
    icon: string;
    eli5Title: string;
    eli5Description: string;
    eli5Source: string;
    eli5Calculation: string;
    eli5Next: string;
}

const ValuationBadge: React.FC<ValuationBadgeProps> = ({ source, confidence, size = 'sm', itemName }) => {
    const [showModal, setShowModal] = useState(false);

    const getEbaySearchUrl = (name: string) => {
        const query = encodeURIComponent(name);
        return `https://www.ebay.com/sch/i.html?_nkw=${query}&_sop=13&LH_Complete=1&LH_Sold=1`;
    };

    const getSourceConfig = (src: string | null | undefined): SourceConfig => {
        switch (src) {
            case 'api':
            case 'API_VERIFIED':
                return {
                    label: 'API Verified',
                    bgColor: 'bg-blue-100',
                    textColor: 'text-blue-800',
                    icon: '🔷',
                    eli5Title: 'API Verified Price',
                    eli5Description: 'This price is pulled automatically from a trusted price guide that tracks real completed sales — not just listings.',
                    eli5Source: 'PriceCharting.com is a video game price database used by collectors and retailers. It aggregates completed sales from eBay, Amazon, and game stores, updated daily.',
                    eli5Calculation: 'We look at sales from the last 90 days, weight recent sales higher, and adjust for condition. For PSA graded cards, we apply a multiplier (PSA 10 = 3x, PSA 9 = 1.8x, PSA 7 = 1.2x). 85%+ = strong data.',
                    eli5Next: 'Think it\'s wrong? Use "Set Value" to override with your own price.',
                };
            case 'user_override':
            case 'USER_DEFINED_UNIQUE':
                return {
                    label: 'User Defined',
                    bgColor: 'bg-yellow-100',
                    textColor: 'text-yellow-800',
                    icon: '📝',
                    eli5Title: 'User Defined Price',
                    eli5Description: 'The owner believes this item is worth more (or less) than the automatic price and set a custom value.',
                    eli5Source: 'Set manually by the item owner through the "Set Value" option.',
                    eli5Calculation: 'No algorithm — this is the owner\'s personal opinion. They may know something the price guides don\'t (rare variant, signed copy, etc).',
                    eli5Next: 'Want automatic pricing? Use "Auto-Price" to link to a price guide.',
                };
            case 'user_defined':
            case 'USER_DEFINED_GENERIC':
                return {
                    label: 'User Defined',
                    bgColor: 'bg-yellow-100',
                    textColor: 'text-yellow-800',
                    icon: '📝',
                    eli5Title: 'User Defined Price',
                    eli5Description: 'The owner entered this price when they added the item. It hasn\'t been verified against any price guide yet.',
                    eli5Source: 'Entered by the item owner during item creation.',
                    eli5Calculation: 'No algorithm — this is the owner\'s best guess at value.',
                    eli5Next: 'Want more accuracy? Use "Auto-Price" to link to a price database.',
                };
            case 'trade_history':
                return {
                    label: 'Trade Verified',
                    bgColor: 'bg-green-100',
                    textColor: 'text-green-800',
                    icon: '📈',
                    eli5Title: 'Trade History Price',
                    eli5Description: 'This price is based on what people actually paid for similar items in completed Leverage trades — the most reliable source.',
                    eli5Source: 'Leverage\'s internal trade database. We only count completed trades where both parties confirmed receipt.',
                    eli5Calculation: 'We find items with similar names/categories, average their trade values, and weight recent trades higher. 10+ trades = high confidence.',
                    eli5Next: 'Trade more items to help improve pricing accuracy for everyone!',
                };
            case 'ai_estimate':
                return {
                    label: 'AI Estimate',
                    bgColor: 'bg-purple-100',
                    textColor: 'text-purple-800',
                    icon: '🤖',
                    eli5Title: 'AI Estimate',
                    eli5Description: 'Our AI analyzed similar items and estimated a price. Useful for rare items with limited sales data.',
                    eli5Source: 'Leverage AI model trained on millions of collectible sales and item characteristics.',
                    eli5Calculation: 'Machine learning finds items with similar names, conditions, and categories, then estimates value based on their prices. Less reliable than API or trade data.',
                    eli5Next: 'For better accuracy, use "Auto-Price" to link to a known product.',
                };
            default:
                return {
                    label: 'Unverified',
                    bgColor: 'bg-gray-100',
                    textColor: 'text-gray-600',
                    icon: '❓',
                    eli5Title: 'Unverified Price',
                    eli5Description: 'We couldn\'t find pricing data for this item yet. The current value is just a placeholder.',
                    eli5Source: 'No data source connected. This item isn\'t linked to any price guide or trade history.',
                    eli5Calculation: 'No calculation performed. The displayed price may be a default or owner estimate.',
                    eli5Next: 'Fix this: Open the item, tap "Auto-Price" to search for it in price guides, or use "Set Value" to add your own price.',
                };
        }
    };

    const config = getSourceConfig(source);
    const sizeClasses = size === 'sm'
        ? 'text-xs px-2 py-0.5'
        : 'text-sm px-3 py-1';

    const confidenceLevel = confidence !== null && confidence !== undefined
        ? confidence >= 85 ? 'High' : confidence >= 70 ? 'Good' : confidence >= 50 ? 'Fair' : 'Low'
        : null;

    return (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(true);
                }}
                className={`inline-flex items-center gap-1 rounded-full font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 transition-all ${config.bgColor} ${config.textColor} ${sizeClasses}`}
            >
                <span>{config.icon}</span>
                <span>{config.label}</span>
                {confidence !== null && confidence !== undefined && (
                    <span className="opacity-70">({confidence}%)</span>
                )}
            </button>

            {/* ELI5 Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className={`${config.bgColor} px-5 py-4`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">{config.icon}</span>
                                    <h3 className={`font-bold ${config.textColor}`}>{config.eli5Title}</h3>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className={`${config.textColor} opacity-60 hover:opacity-100 text-xl`}
                                >
                                    ✕
                                </button>
                            </div>
                            {confidence !== null && confidence !== undefined && (
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-white/50 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${confidence >= 85 ? 'bg-green-500' : confidence >= 70 ? 'bg-blue-500' : confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                            style={{ width: `${confidence}%` }}
                                        />
                                    </div>
                                    <span className={`text-xs font-medium ${config.textColor}`}>
                                        {confidence}% {confidenceLevel}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4">
                            {/* What it means */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    What This Means
                                </h4>
                                <p className="text-sm text-slate-700">
                                    {config.eli5Description}
                                </p>
                            </div>

                            {/* Where data comes from */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    📊 Data Source
                                </h4>
                                <p className="text-sm text-slate-700">
                                    {config.eli5Source}
                                </p>
                            </div>

                            {/* How it's calculated */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    🧮 How It's Calculated
                                </h4>
                                <p className="text-sm text-slate-700">
                                    {config.eli5Calculation}
                                </p>
                            </div>

                            {/* What to do next */}
                            <div className="bg-slate-50 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    👉 What You Can Do
                                </h4>
                                <p className="text-sm text-slate-600">
                                    {config.eli5Next}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-5 space-y-2">
                            {itemName && (
                                <a
                                    href={getEbaySearchUrl(itemName)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                                >
                                    🔍 Verify on eBay
                                </a>
                            )}
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ValuationBadge;
