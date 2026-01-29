import React, { useState } from 'react';

interface ValuationBadgeProps {
    source: string | null | undefined;
    lastUpdated?: string | null; // ISO date string
    condition?: string | null;
    size?: 'sm' | 'md';
    itemName?: string;
}

interface SourceConfig {
    label: string;
    bgColor: string;
    textColor: string;
    icon: string;
    title: string;
    description: string;
    dataSource: string;
    methodology: string;
    nextSteps: string;
}

// Format relative time (e.g., "2 hours ago", "3 days ago")
const formatRelativeTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
};

// Format condition for display
const formatCondition = (condition: string | null | undefined): string => {
    if (!condition) return 'Standard';
    const conditionMap: Record<string, string> = {
        'LOOSE': 'Loose (no box/manual)',
        'CIB': 'Complete in Box',
        'NEW_SEALED': 'New/Sealed',
        'GRADED': 'Professionally Graded',
        'GOOD': 'Good Condition',
        'OTHER': 'Other',
    };
    return conditionMap[condition] || condition;
};

const ValuationBadge: React.FC<ValuationBadgeProps> = ({
    source,
    lastUpdated,
    condition,
    size = 'sm',
    itemName
}) => {
    const [showModal, setShowModal] = useState(false);

    const getEbaySearchUrl = (name: string) => {
        const query = encodeURIComponent(name);
        return `https://www.ebay.com/sch/i.html?_nkw=${query}&_sop=13&LH_Complete=1&LH_Sold=1`;
    };

    const getSourceConfig = (src: string | null | undefined): SourceConfig => {
        switch (src) {
            case 'consolidated':
                return {
                    label: 'Multi-Source',
                    bgColor: 'bg-emerald-100',
                    textColor: 'text-emerald-800',
                    icon: '◎',
                    title: 'Multi-Source Price',
                    description: 'This price combines data from multiple sources (PriceCharting + eBay sold listings) for improved accuracy.',
                    dataSource: 'PriceCharting price guide combined with recent eBay completed sales. Each source is weighted based on data quality and volume.',
                    methodology: 'We calculate a weighted average: sources with more recent sales data get higher weight. The final price reflects real market activity.',
                    nextSteps: 'This is our most accurate pricing method! Tap "Refresh price from API" to see the breakdown by source.',
                };
            case 'api':
            case 'API_VERIFIED':
                return {
                    label: 'API Verified',
                    bgColor: 'bg-blue-100',
                    textColor: 'text-blue-800',
                    icon: '✓',
                    title: 'API Verified Price',
                    description: 'This price comes from PriceCharting.com, a trusted price guide used by collectors and retailers.',
                    dataSource: 'PriceCharting aggregates completed sales from eBay, Amazon, and game stores. Their database is updated daily with real transaction data.',
                    methodology: 'We pull the price for your item\'s condition directly from PriceCharting. No additional calculations are performed — you see exactly what they report.',
                    nextSteps: 'Tap "Refresh Price" anytime to get the latest data. If you think the price is wrong, use "Set Value" to override it.',
                };
            case 'user_override':
            case 'USER_DEFINED_UNIQUE':
            case 'user_defined':
            case 'USER_DEFINED_GENERIC':
                return {
                    label: 'User Set',
                    bgColor: 'bg-amber-100',
                    textColor: 'text-amber-800',
                    icon: '✎',
                    title: 'User Set Price',
                    description: 'You set this price manually. It may be higher or lower than market value based on your knowledge of the item.',
                    dataSource: 'This price was entered by the item owner, not pulled from any external database.',
                    methodology: 'No algorithm — this is entirely the owner\'s valuation. They may know something price guides don\'t (rare variant, autographed, etc.)',
                    nextSteps: 'Want market pricing? Use "Auto-Price" to link this item to PriceCharting and get automatic updates.',
                };
            case 'trade_history':
                return {
                    label: 'Trade Verified',
                    bgColor: 'bg-green-100',
                    textColor: 'text-green-800',
                    icon: '↔',
                    title: 'Trade Verified Price',
                    description: 'This price is based on actual completed trades on Leverage — the most reliable source.',
                    dataSource: 'Leverage\'s internal trade database. Only completed trades where both parties confirmed receipt are counted.',
                    methodology: 'We average what similar items traded for on Leverage, weighting recent trades more heavily.',
                    nextSteps: 'Trade more items to help improve pricing accuracy for everyone!',
                };
            case 'ai_estimate':
                return {
                    label: 'AI Estimate',
                    bgColor: 'bg-purple-100',
                    textColor: 'text-purple-800',
                    icon: '◈',
                    title: 'AI Estimated Price',
                    description: 'Our AI analyzed similar items and estimated a price. Less reliable than API or trade data.',
                    dataSource: 'Leverage AI model analyzing item characteristics and similar sales.',
                    methodology: 'Machine learning finds items with similar names, conditions, and categories, then estimates value based on their prices.',
                    nextSteps: 'For better accuracy, use "Auto-Price" to link to a known product in PriceCharting.',
                };
            default:
                return {
                    label: 'Unverified',
                    bgColor: 'bg-gray-100',
                    textColor: 'text-gray-600',
                    icon: '—',
                    title: 'Unverified Price',
                    description: 'This item isn\'t linked to any price database yet. The displayed value may be inaccurate.',
                    dataSource: 'No external data source connected.',
                    methodology: 'No calculation performed — the price shown may be a default or placeholder.',
                    nextSteps: 'Use "Auto-Price" to search for this item in price guides, or "Set Value" to enter your own price.',
                };
        }
    };

    const config = getSourceConfig(source);
    const isApiSource = source === 'api' || source === 'API_VERIFIED' || source === 'consolidated';
    const sizeClasses = size === 'sm'
        ? 'text-xs px-2 py-0.5'
        : 'text-sm px-3 py-1';

    return (
        <>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setShowModal(true);
                }}
                className={`inline-flex items-center gap-1 rounded-full font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 transition-all ${config.bgColor} ${config.textColor} ${sizeClasses}`}
            >
                <span className="font-bold">{config.icon}</span>
                <span>{config.label}</span>
            </button>

            {/* Info Modal */}
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
                                    <span className="text-2xl font-bold">{config.icon}</span>
                                    <h3 className={`font-bold ${config.textColor}`}>{config.title}</h3>
                                </div>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className={`${config.textColor} opacity-60 hover:opacity-100 text-xl`}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Quick stats for API verified */}
                            {isApiSource && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {lastUpdated && (
                                        <span className="text-xs bg-white/50 rounded-full px-2 py-1">
                                            🕒 Updated {formatRelativeTime(lastUpdated)}
                                        </span>
                                    )}
                                    {condition && (
                                        <span className="text-xs bg-white/50 rounded-full px-2 py-1">
                                            📦 {formatCondition(condition)}
                                        </span>
                                    )}
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
                                    {config.description}
                                </p>
                            </div>

                            {/* Where data comes from */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    📊 Data Source
                                </h4>
                                <p className="text-sm text-slate-700">
                                    {config.dataSource}
                                </p>
                            </div>

                            {/* How it's calculated */}
                            <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    🧮 Methodology
                                </h4>
                                <p className="text-sm text-slate-700">
                                    {config.methodology}
                                </p>
                            </div>

                            {/* What to do next */}
                            <div className="bg-slate-50 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                    👉 What You Can Do
                                </h4>
                                <p className="text-sm text-slate-600">
                                    {config.nextSteps}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 pb-5">
                            <button
                                onClick={() => setShowModal(false)}
                                className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-sm font-medium transition-all"
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
