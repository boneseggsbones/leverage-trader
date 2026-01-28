import React, { useState, useEffect } from 'react';
import { Item } from '../types';
import { fetchItemValuations, fetchSimilarPrices, submitValueOverride, refreshItemValuation as refreshItemValuationApi, searchExternalProducts, linkItemToProduct as linkItemToProductApi, ExternalProduct, ItemValuationData, SimilarPricesData, PriceSource, RefreshValuationResult } from '../api/api';
import { useAuth } from '../context/AuthContext';
import ValuationBadge from './ValuationBadge';

interface ItemValuationModalProps {
    show: boolean;
    onClose: () => void;
    item: Item | null;
    onValuationUpdated?: () => void;
}

type ActivePanel = null | 'history' | 'autoPrice' | 'setPrice' | 'psa';

// TCG category ID from the database
const TCG_CATEGORY_ID = 2;

const ItemValuationModal: React.FC<ItemValuationModalProps> = ({ show, onClose, item, onValuationUpdated }) => {
    const { currentUser } = useAuth();
    const [activePanel, setActivePanel] = useState<ActivePanel>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [valuationData, setValuationData] = useState<ItemValuationData | null>(null);
    const [similarPrices, setSimilarPrices] = useState<SimilarPricesData | null>(null);

    // Override form state
    const [overrideValue, setOverrideValue] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // Refresh state
    const [refreshing, setRefreshing] = useState(false);
    const [priceSources, setPriceSources] = useState<PriceSource[] | undefined>(undefined);
    const [priceTrend, setPriceTrend] = useState<'up' | 'down' | 'stable' | undefined>(undefined);
    const [priceVolatility, setPriceVolatility] = useState<'low' | 'medium' | 'high' | undefined>(undefined);

    // Product search/link state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ExternalProduct[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState(false);
    const [linkSuccess, setLinkSuccess] = useState(false);
    const [linkedProductInfo, setLinkedProductInfo] = useState<{ name: string; price: number } | null>(null);

    // Auto-match state (prevents gaming by auto-searching item name)
    const [autoMatchedResults, setAutoMatchedResults] = useState<ExternalProduct[]>([]);
    const [autoSearching, setAutoSearching] = useState(false);
    const [showManualSearch, setShowManualSearch] = useState(false);

    // PSA state
    const [psaCertNumber, setPsaCertNumber] = useState('');
    const [psaVerifying, setPsaVerifying] = useState(false);
    const [psaData, setPsaData] = useState<any>(null);
    const [psaMessage, setPsaMessage] = useState<string | null>(null);
    const [psaLinking, setPsaLinking] = useState(false);

    // Debounced search
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timeoutId = setTimeout(async () => {
            try {
                const result = await searchExternalProducts(searchQuery);
                setSearchResults(result.products);
            } catch (err) {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    useEffect(() => {
        if (show && item) {
            loadData();
            setActivePanel(null);
            setLinkSuccess(false);
            setLinkedProductInfo(null);
            setSubmitSuccess(false);
            setAutoMatchedResults([]);
            setShowManualSearch(false);
        }
    }, [show, item]);

    // Auto-search when autoPrice panel opens
    useEffect(() => {
        if (activePanel === 'autoPrice' && item && !linkSuccess) {
            const doAutoSearch = async () => {
                setAutoSearching(true);
                setAutoMatchedResults([]);
                setShowManualSearch(false);
                try {
                    const result = await searchExternalProducts(item.name);
                    setAutoMatchedResults(result.products.slice(0, 3)); // Top 3 matches
                } catch (err) {
                    console.error('Auto-search failed:', err);
                    setAutoMatchedResults([]);
                } finally {
                    setAutoSearching(false);
                }
            };
            doAutoSearch();
        }
    }, [activePanel, item?.id, linkSuccess]);

    const loadData = async () => {
        if (!item) return;
        setLoading(true);
        setError(null);
        try {
            const [valData, pricesData] = await Promise.all([
                fetchItemValuations(item.id),
                fetchSimilarPrices(item.id)
            ]);
            setValuationData(valData);
            setSimilarPrices(pricesData);
            if (valData.item.current_emv_cents) {
                setOverrideValue((valData.item.current_emv_cents / 100).toFixed(2));
            }
        } catch (err) {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (cents: number | null | undefined) => {
        if (cents === null || cents === undefined) return '—';
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const handleSubmitOverride = async () => {
        if (!item || !currentUser) return;
        const valueCents = Math.round(parseFloat(overrideValue) * 100);
        if (isNaN(valueCents) || valueCents <= 0) return;

        setSubmitting(true);
        try {
            await submitValueOverride(item.id, currentUser.id, valueCents);
            setSubmitSuccess(true);
            setTimeout(() => {
                loadData();
                if (onValuationUpdated) onValuationUpdated();
                setActivePanel(null);
            }, 1000);
        } catch (err) {
            setError('Failed to save');
        } finally {
            setSubmitting(false);
        }
    };

    if (!show || !item) return null;

    const isTCG = (valuationData?.item as any)?.category_id === TCG_CATEGORY_ID;
    const hasPSA = !!(valuationData?.item as any)?.psa_grade || !!psaData;
    const isLinked = !!(valuationData?.item as any)?.product_id || valuationData?.apiValuations?.length > 0;

    // Action tiles configuration
    const tiles = [
        {
            id: 'history',
            icon: '📈',
            label: 'Price History',
            sublabel: similarPrices?.stats ? `${similarPrices.stats.count} trades` : 'View trends',
            color: 'from-emerald-500 to-green-600',
            bgColor: 'bg-emerald-50 hover:bg-emerald-100',
            show: true,
        },
        {
            id: 'autoPrice',
            icon: '🔗',
            label: 'Auto-Price',
            sublabel: isLinked ? '✓ Connected' : 'Link to catalog',
            color: 'from-violet-500 to-purple-600',
            bgColor: isLinked ? 'bg-violet-100' : 'bg-violet-50 hover:bg-violet-100',
            show: true,
        },
        {
            id: 'setPrice',
            icon: '✏️',
            label: 'Set Value',
            sublabel: 'Manual price',
            color: 'from-amber-500 to-orange-600',
            bgColor: 'bg-amber-50 hover:bg-amber-100',
            show: true,
        },
        {
            id: 'psa',
            icon: '🏆',
            label: 'Verify PSA',
            sublabel: hasPSA ? `PSA ${psaData?.grade || (valuationData?.item as any)?.psa_grade}` : 'Add grade',
            color: 'from-red-500 to-rose-600',
            bgColor: hasPSA ? 'bg-red-100' : 'bg-red-50 hover:bg-red-100',
            show: isTCG,
        },
    ].filter(t => t.show);

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen p-4">
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

                <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                    {/* Header - Compact */}
                    <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 px-6 pt-6 pb-8">
                        <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white text-xl">✕</button>
                        <p className="text-slate-400 text-sm truncate pr-8">{item.name}</p>

                        {/* Hero Value */}
                        {loading ? (
                            <div className="text-4xl font-bold text-white/50 mt-2">Loading...</div>
                        ) : (
                            <div className="mt-2 flex items-baseline gap-3">
                                <span className="text-5xl font-bold text-white tracking-tight">
                                    {formatCurrency(valuationData?.item?.current_emv_cents)}
                                </span>
                                <ValuationBadge
                                    source={valuationData?.item?.emv_source}
                                    lastUpdated={(valuationData?.item as any)?.emv_updated_at}
                                    condition={(valuationData?.item as any)?.condition}
                                    size="sm"
                                    itemName={item?.name}
                                />
                            </div>
                        )}

                        {/* Quick refresh */}
                        <button
                            onClick={async () => {
                                if (!item) return;
                                setRefreshing(true);
                                try {
                                    const result: RefreshValuationResult = await refreshItemValuationApi(item.id);
                                    setPriceSources(result.sources);
                                    setPriceTrend(result.trend);
                                    setPriceVolatility(result.volatility);
                                    loadData();
                                    if (onValuationUpdated) onValuationUpdated();
                                } finally {
                                    setRefreshing(false);
                                }
                            }}
                            disabled={refreshing}
                            className="mt-3 text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
                        >
                            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                            {refreshing ? 'Updating...' : 'Refresh price from API'}
                        </button>

                        {/* Price Source Breakdown */}
                        {priceSources && priceSources.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {priceSources.map((source, idx) => (
                                        <div key={idx} className="bg-slate-700/50 rounded-lg px-2.5 py-1.5 text-xs">
                                            <span className="text-slate-400 capitalize">{source.provider}:</span>
                                            <span className="text-white font-medium ml-1">
                                                ${(source.price / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                            {source.dataPoints > 1 && (
                                                <span className="text-slate-500 ml-1">({source.dataPoints} sales)</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    {priceTrend && (
                                        <span className={`text-xs px-2 py-0.5 rounded ${priceTrend === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                                            priceTrend === 'down' ? 'bg-red-500/20 text-red-400' :
                                                'bg-slate-600/50 text-slate-400'
                                            }`}>
                                            {priceTrend === 'up' ? '📈 Trending Up' : priceTrend === 'down' ? '📉 Trending Down' : '→ Stable'}
                                        </span>
                                    )}
                                    {priceVolatility && priceVolatility !== 'low' && (
                                        <span className={`text-xs px-2 py-0.5 rounded ${priceVolatility === 'high' ? 'bg-amber-500/20 text-amber-400' :
                                            'bg-slate-600/50 text-slate-400'
                                            }`}>
                                            {priceVolatility === 'high' ? '⚠️ High Volatility' : 'Med Volatility'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main Content */}
                    <div className="p-5">
                        {!activePanel ? (
                            /* Action Tiles Grid */
                            <div className={`grid ${tiles.length === 4 ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                                {tiles.map(tile => (
                                    <button
                                        key={tile.id}
                                        onClick={() => setActivePanel(tile.id as ActivePanel)}
                                        className={`${tile.bgColor} rounded-2xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]`}
                                    >
                                        <span className="text-2xl">{tile.icon}</span>
                                        <p className="font-semibold text-slate-800 mt-2 text-sm">{tile.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{tile.sublabel}</p>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            /* Expanded Panel */
                            <div className="animate-in slide-in-from-bottom-2 duration-200">
                                <button
                                    onClick={() => setActivePanel(null)}
                                    className="text-sm text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1"
                                >
                                    ← Back
                                </button>

                                {/* Price History Panel */}
                                {activePanel === 'history' && (
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                            📈 Price History
                                        </h3>
                                        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                                            See what similar items sold for on Leverage. More trades = more accurate pricing.
                                        </p>
                                        {similarPrices?.stats ? (
                                            <div className="bg-emerald-50 rounded-xl p-4 space-y-3">
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <span className="text-emerald-600">Trades</span>
                                                        <p className="font-bold text-lg">{similarPrices.stats.count}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-emerald-600">Average</span>
                                                        <p className="font-bold text-lg">{formatCurrency(similarPrices.stats.avgPriceCents)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-emerald-600">Low</span>
                                                        <p className="font-medium">{formatCurrency(similarPrices.stats.minPriceCents)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-emerald-600">High</span>
                                                        <p className="font-medium">{formatCurrency(similarPrices.stats.maxPriceCents)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-slate-400">
                                                <p className="text-3xl mb-2">📊</p>
                                                <p className="text-sm">No trade history yet</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Auto-Price Panel */}
                                {activePanel === 'autoPrice' && (
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                            🔗 Auto-Price
                                        </h3>

                                        {linkSuccess ? (
                                            <div className="text-center py-6 bg-green-50 rounded-xl">
                                                <p className="text-4xl mb-2">✓</p>
                                                <p className="text-green-600 font-medium text-lg">Connected!</p>
                                                {linkedProductInfo && (
                                                    <>
                                                        <p className="text-sm text-slate-600 mt-2">
                                                            Linked to <span className="font-medium">{linkedProductInfo.name}</span>
                                                        </p>
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            Catalog price: ${(linkedProductInfo.price / 100).toLocaleString()}
                                                        </p>
                                                    </>
                                                )}
                                                <p className="text-xs text-slate-400 mt-3 bg-slate-100 rounded-lg p-2 mx-4">
                                                    💡 Your item's value now blends this catalog price with recent eBay sales for extra accuracy.
                                                </p>
                                            </div>
                                        ) : linking ? (
                                            /* Linking in progress - show clear loading state */
                                            <div className="text-center py-8">
                                                <div className="relative inline-block">
                                                    <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto"></div>
                                                    <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl">🔗</span>
                                                </div>
                                                <p className="text-lg font-medium text-slate-700 mt-4">Linking to catalog...</p>
                                                <p className="text-sm text-slate-500 mt-1">Fetching latest prices from multiple sources</p>
                                                <div className="mt-4 space-y-2 text-xs text-slate-400 animate-pulse">
                                                    <p>• Connecting to PriceCharting...</p>
                                                    <p>• Checking eBay sold listings...</p>
                                                    <p>• Calculating consolidated value...</p>
                                                </div>
                                            </div>
                                        ) : autoSearching ? (
                                            <div className="text-center py-8">
                                                <div className="animate-spin text-3xl mb-2">🔍</div>
                                                <p className="text-sm text-slate-500">Finding matches for "{item?.name}"...</p>
                                            </div>
                                        ) : !showManualSearch ? (
                                            /* Auto-matched results view */
                                            <>
                                                {/* Visual explanation of Auto-Price */}
                                                <div className="bg-gradient-to-r from-slate-50 to-violet-50 rounded-xl p-4 mb-4">
                                                    <div className="flex items-center justify-center gap-3 text-2xl mb-2">
                                                        <span>📦</span>
                                                        <span className="text-violet-400">→</span>
                                                        <span>📚</span>
                                                        <span className="text-violet-400">→</span>
                                                        <span>💰</span>
                                                    </div>
                                                    <p className="text-center text-sm text-slate-700 font-medium">
                                                        Match your item to our price database
                                                    </p>
                                                    <p className="text-center text-xs text-slate-500 mt-1">
                                                        We'll track its value automatically
                                                    </p>
                                                </div>

                                                <p className="text-sm text-slate-600 font-medium mb-2">
                                                    Which one matches?
                                                </p>

                                                {autoMatchedResults.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {autoMatchedResults.map(product => (
                                                            <button
                                                                key={product.id}
                                                                onClick={async () => {
                                                                    if (!item) return;
                                                                    setLinking(true);
                                                                    try {
                                                                        await linkItemToProductApi(item.id, product.id, product.name, product.platform);
                                                                        setLinkedProductInfo({ name: product.name, price: product.loosePrice || 0 });
                                                                        setLinkSuccess(true);
                                                                        loadData();
                                                                        if (onValuationUpdated) onValuationUpdated();
                                                                    } finally {
                                                                        setLinking(false);
                                                                    }
                                                                }}
                                                                disabled={linking}
                                                                className="w-full flex justify-between items-center p-3 bg-violet-50 hover:bg-violet-100 border-2 border-violet-200 rounded-xl text-left text-sm transition-all disabled:opacity-50"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-medium text-slate-800 truncate">{product.name}</p>
                                                                    <p className="text-xs text-slate-500">{product.platform}</p>
                                                                </div>
                                                                <span className="bg-violet-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg ml-2">
                                                                    {linking ? '...' : 'This one'}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-6 bg-slate-50 rounded-xl">
                                                        <p className="text-3xl mb-2">🤔</p>
                                                        <p className="text-sm text-slate-600 font-medium">No exact matches found</p>
                                                        <p className="text-xs text-slate-400 mt-1">Try searching manually below</p>
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => setShowManualSearch(true)}
                                                    className="w-full text-center text-xs text-slate-400 hover:text-violet-600 py-2"
                                                >
                                                    None of these? Search manually →
                                                </button>
                                            </>
                                        ) : (
                                            /* Manual search mode */
                                            <>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <button
                                                        onClick={() => setShowManualSearch(false)}
                                                        className="text-xs text-slate-500 hover:text-slate-700"
                                                    >
                                                        ← Back to matches
                                                    </button>
                                                </div>
                                                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                                                    ⚠️ Manual search lets you link to any product. Choose carefully.
                                                </p>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={searchQuery}
                                                        onChange={e => setSearchQuery(e.target.value)}
                                                        placeholder="Search product catalog..."
                                                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                                    />
                                                    {searching && (
                                                        <div className="absolute right-3 top-3 animate-spin">⏳</div>
                                                    )}
                                                </div>
                                                {searchResults.length > 0 && (
                                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                                        {searchResults.slice(0, 5).map(product => (
                                                            <button
                                                                key={product.id}
                                                                onClick={async () => {
                                                                    if (!item) return;
                                                                    setLinking(true);
                                                                    try {
                                                                        await linkItemToProductApi(item.id, product.id, product.name, product.platform);
                                                                        setLinkedProductInfo({ name: product.name, price: product.loosePrice || 0 });
                                                                        setLinkSuccess(true);
                                                                        setSearchQuery('');
                                                                        setSearchResults([]);
                                                                        loadData();
                                                                        if (onValuationUpdated) onValuationUpdated();
                                                                    } finally {
                                                                        setLinking(false);
                                                                    }
                                                                }}
                                                                disabled={linking}
                                                                className="w-full flex justify-between items-center p-3 bg-slate-50 hover:bg-violet-50 rounded-lg text-left text-sm disabled:opacity-50"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-medium text-slate-800 truncate">{product.name}</p>
                                                                    <p className="text-xs text-slate-500">{product.platform}</p>
                                                                </div>
                                                                <span className="text-violet-600 text-xs font-medium">
                                                                    {linking ? '...' : 'This one'}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {!searching && searchQuery.length < 2 && searchResults.length === 0 && (
                                                    <p className="text-center text-slate-400 text-sm py-4">
                                                        Type to search the price catalog
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Set Value Panel */}
                                {activePanel === 'setPrice' && (
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                            ✏️ Set Value
                                        </h3>
                                        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                                            Think it's worth more or less? Enter your price below. Great for rare items.
                                        </p>
                                        {submitSuccess ? (
                                            <div className="text-center py-6">
                                                <p className="text-4xl mb-2">✓</p>
                                                <p className="text-green-600 font-medium">Saved!</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-3 text-slate-400 text-lg">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={overrideValue}
                                                        onChange={e => setOverrideValue(e.target.value)}
                                                        className="w-full pl-8 border border-slate-200 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                                    />
                                                </div>
                                                {/* Show comparison to auto-price */}
                                                {valuationData?.item?.current_emv_cents && overrideValue && (
                                                    (() => {
                                                        const currentCents = valuationData.item.current_emv_cents;
                                                        const overrideCents = Math.round(parseFloat(overrideValue) * 100);
                                                        const diff = overrideCents - currentCents;
                                                        const pctChange = Math.round((diff / currentCents) * 100);
                                                        if (isNaN(pctChange) || Math.abs(pctChange) < 1) return null;
                                                        return (
                                                            <div className={`text-sm p-2 rounded-lg ${pctChange > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                                {pctChange > 0 ? '📈' : '📉'} {pctChange > 0 ? '+' : ''}{pctChange}% vs auto-price (${(currentCents / 100).toFixed(0)})
                                                            </div>
                                                        );
                                                    })()
                                                )}
                                                <button
                                                    onClick={handleSubmitOverride}
                                                    disabled={submitting}
                                                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                                                >
                                                    {submitting ? 'Saving...' : 'Save Value'}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* PSA Panel */}
                                {activePanel === 'psa' && (
                                    <div className="space-y-4">
                                        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                            🏆 Verify PSA
                                        </h3>
                                        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">
                                            Enter the cert number from your PSA label. We'll verify the grade and show how rare it is.
                                        </p>
                                        {hasPSA ? (
                                            <div className="bg-green-50 rounded-xl p-4 text-center">
                                                <div className="inline-block bg-gradient-to-br from-red-500 to-red-600 text-white px-6 py-3 rounded-xl">
                                                    <span className="text-3xl font-bold">PSA {psaData?.grade || (valuationData?.item as any)?.psa_grade}</span>
                                                </div>
                                                {psaData?.gradeDescription && (
                                                    <p className="text-sm text-green-700 mt-2">{psaData.gradeDescription}</p>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={psaCertNumber}
                                                        onChange={e => setPsaCertNumber(e.target.value.replace(/\D/g, ''))}
                                                        placeholder="Cert #"
                                                        className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                                        maxLength={12}
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            if (psaCertNumber.length < 5) return;
                                                            setPsaVerifying(true);
                                                            setPsaMessage(null);
                                                            try {
                                                                const response = await fetch(`http://localhost:4000/api/psa/verify/${psaCertNumber}`);
                                                                const data = await response.json();
                                                                if (!response.ok) {
                                                                    setPsaMessage(data.error || 'Not found');
                                                                } else {
                                                                    setPsaData(data);
                                                                }
                                                            } catch {
                                                                setPsaMessage('Verification failed');
                                                            } finally {
                                                                setPsaVerifying(false);
                                                            }
                                                        }}
                                                        disabled={psaVerifying || psaCertNumber.length < 5}
                                                        className="px-5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        {psaVerifying ? '...' : 'Verify'}
                                                    </button>
                                                </div>
                                                {psaMessage && (
                                                    <p className="text-sm text-red-500">{psaMessage}</p>
                                                )}
                                                {psaData && (
                                                    <button
                                                        onClick={async () => {
                                                            if (!item) return;
                                                            setPsaLinking(true);
                                                            try {
                                                                await fetch(`http://localhost:4000/api/items/${item.id}/link-psa`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ certNumber: psaCertNumber }),
                                                                });
                                                                loadData();
                                                                if (onValuationUpdated) onValuationUpdated();
                                                            } finally {
                                                                setPsaLinking(false);
                                                            }
                                                        }}
                                                        disabled={psaLinking}
                                                        className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
                                                    >
                                                        {psaLinking ? 'Saving...' : `✓ Link PSA ${psaData.grade}`}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItemValuationModal;
