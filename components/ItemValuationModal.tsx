import React, { useState, useEffect } from 'react';
import { Item } from '../types';
import { fetchItemValuations, fetchSimilarPrices, submitValueOverride, refreshItemValuation as refreshItemValuationApi, searchExternalProducts, linkItemToProduct as linkItemToProductApi, ExternalProduct, ItemValuationData, SimilarPricesData } from '../api/api';
import { useAuth } from '../context/AuthContext';
import ValuationBadge from './ValuationBadge';

interface ItemValuationModalProps {
    show: boolean;
    onClose: () => void;
    item: Item | null;
    onValuationUpdated?: () => void;
}

type TabType = 'overview' | 'history' | 'override' | 'link';

const ItemValuationModal: React.FC<ItemValuationModalProps> = ({ show, onClose, item, onValuationUpdated }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [valuationData, setValuationData] = useState<ItemValuationData | null>(null);
    const [similarPrices, setSimilarPrices] = useState<SimilarPricesData | null>(null);

    // Override form state
    const [overrideValue, setOverrideValue] = useState<string>('');
    const [overrideReason, setOverrideReason] = useState<string>('');
    const [overrideJustification, setOverrideJustification] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    // Refresh state
    const [refreshing, setRefreshing] = useState(false);
    const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

    // Product search/link state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ExternalProduct[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState(false);
    const [linkMessage, setLinkMessage] = useState<string | null>(null);

    // Debounced search effect - triggers 300ms after user stops typing
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
                setLinkMessage('Search failed');
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
        }
    }, [show, item]);

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

            // Pre-fill override value with current EMV
            if (valData.item.current_emv_cents) {
                setOverrideValue((valData.item.current_emv_cents / 100).toFixed(2));
            }
        } catch (err) {
            setError('Failed to load valuation data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!item || !currentUser) return;

        const valueCents = Math.round(parseFloat(overrideValue) * 100);
        if (isNaN(valueCents) || valueCents <= 0) {
            setError('Please enter a valid value');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await submitValueOverride(
                item.id,
                currentUser.id,
                valueCents,
                overrideReason || undefined,
                overrideJustification || undefined
            );
            setSubmitSuccess(true);
            setTimeout(() => {
                setSubmitSuccess(false);
                loadData(); // Reload to show the new override
                if (onValuationUpdated) onValuationUpdated();
            }, 1500);
        } catch (err) {
            setError('Failed to submit override');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const formatCurrency = (cents: number | null | undefined) => {
        if (cents === null || cents === undefined) return '—';
        return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (!show || !item) return null;

    return (
        <div className="fixed z-50 inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
                    <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                </div>

                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full" onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-semibold text-white">Item Valuation</h3>
                                <p className="text-blue-100 text-sm mt-1">{item.name}</p>
                            </div>
                            <button onClick={onClose} className="text-white hover:text-blue-200 text-2xl leading-none">&times;</button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Loading valuation data...</div>
                    ) : error && !valuationData ? (
                        <div className="p-8 text-center text-red-500">{error}</div>
                    ) : valuationData ? (
                        <>
                            {/* Current Value Summary */}
                            <div className="bg-gray-50 px-6 py-4 border-b">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-sm text-gray-500">Current Estimated Value</p>
                                        <p className="text-3xl font-bold text-gray-900">
                                            {formatCurrency(valuationData.item.current_emv_cents)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <ValuationBadge
                                            source={valuationData.item.emv_source}
                                            confidence={valuationData.item.emv_confidence}
                                            size="md"
                                        />
                                        {valuationData.item.condition && (
                                            <p className="text-sm text-gray-500 mt-2">
                                                Condition: <span className="font-medium">{valuationData.item.condition}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="border-b">
                                <nav className="flex">
                                    {[
                                        { key: 'overview', label: '📊 Overview' },
                                        { key: 'history', label: '📈 Trade History' },
                                        { key: 'link', label: '🔗 Link Product' },
                                        { key: 'override', label: '✏️ Set Value' },
                                    ].map(tab => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setActiveTab(tab.key as TabType)}
                                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                                }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </nav>
                            </div>

                            {/* Tab Content */}
                            <div className="p-6 max-h-80 overflow-y-auto">
                                {activeTab === 'overview' && (
                                    <div className="space-y-6">
                                        {/* Tab Description */}
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                                            <span className="text-2xl">📊</span>
                                            <div>
                                                <h4 className="font-semibold text-gray-800">What's This Worth?</h4>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    This shows how much your item is worth. We check online price guides and what
                                                    other traders think. Click "Refresh from API" to get the latest prices.
                                                </p>
                                            </div>
                                        </div>

                                        {/* API Valuations */}
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="text-sm font-semibold text-gray-700">API Valuations</h4>
                                                <button
                                                    onClick={async () => {
                                                        if (!item) return;
                                                        setRefreshing(true);
                                                        setRefreshMessage(null);
                                                        try {
                                                            const result = await refreshItemValuationApi(item.id);
                                                            setRefreshMessage(result.message);
                                                            if (result.success) {
                                                                loadData();
                                                                if (onValuationUpdated) onValuationUpdated();
                                                            }
                                                        } catch (err) {
                                                            setRefreshMessage('Failed to refresh');
                                                        } finally {
                                                            setRefreshing(false);
                                                        }
                                                    }}
                                                    disabled={refreshing}
                                                    className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 disabled:opacity-50 transition-colors"
                                                >
                                                    {refreshing ? '🔄 Refreshing...' : '🔄 Refresh from API'}
                                                </button>
                                            </div>
                                            {refreshMessage && (
                                                <p className={`text-xs mb-2 ${refreshMessage.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
                                                    {refreshMessage}
                                                </p>
                                            )}
                                            {valuationData.apiValuations.length > 0 ? (
                                                <div className="space-y-2">
                                                    {valuationData.apiValuations.map(av => (
                                                        <div key={av.id} className="flex justify-between items-center bg-blue-50 rounded-lg p-3">
                                                            <div>
                                                                <span className="font-medium text-blue-800">{av.api_provider}</span>
                                                                <span className="text-xs text-gray-500 ml-2">
                                                                    {formatDate(av.fetched_at)}
                                                                </span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-bold text-blue-900">{formatCurrency(av.value_cents)}</span>
                                                                {av.confidence_score && (
                                                                    <span className="text-xs text-gray-500 ml-2">
                                                                        ({av.confidence_score}% confidence)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500 italic">No API valuations available</p>
                                            )}
                                        </div>

                                        {/* User Overrides */}
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2">User Valuations</h4>
                                            {valuationData.userOverrides.length > 0 ? (
                                                <div className="space-y-2">
                                                    {valuationData.userOverrides.map(ov => (
                                                        <div key={ov.id} className="flex justify-between items-center bg-yellow-50 rounded-lg p-3">
                                                            <div>
                                                                <span className={`text-xs px-2 py-0.5 rounded-full ${ov.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                                    ov.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                        'bg-red-100 text-red-800'
                                                                    }`}>
                                                                    {ov.status}
                                                                </span>
                                                                <span className="text-xs text-gray-500 ml-2">
                                                                    {formatDate(ov.created_at)}
                                                                </span>
                                                            </div>
                                                            <span className="font-bold text-yellow-900">{formatCurrency(ov.override_value_cents)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500 italic">No user valuations submitted</p>
                                            )}
                                        </div>

                                        {/* Condition Assessment */}
                                        {valuationData.conditionAssessment && (
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-700 mb-2">Condition Assessment</h4>
                                                <div className="bg-gray-50 rounded-lg p-3">
                                                    <div className="flex justify-between">
                                                        <span>Grade: <strong>{valuationData.conditionAssessment.grade}</strong></span>
                                                        <span>Value Modifier: <strong>{valuationData.conditionAssessment.value_modifier_percent > 0 ? '+' : ''}{valuationData.conditionAssessment.value_modifier_percent}%</strong></span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'history' && similarPrices && (
                                    <div className="space-y-4">
                                        {/* Tab Description */}
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
                                            <span className="text-2xl">📈</span>
                                            <div>
                                                <h4 className="font-semibold text-gray-800">What Did Others Pay?</h4>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    See what people actually paid for items like this one. This helps you know
                                                    if a price is fair. More trades = more reliable pricing.
                                                </p>
                                            </div>
                                        </div>
                                        {similarPrices.stats ? (
                                            <div className="bg-green-50 rounded-lg p-4">
                                                <h4 className="text-sm font-semibold text-green-800 mb-2">Similar Items Traded</h4>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-green-700">Trades:</span>
                                                        <span className="font-bold ml-2">{similarPrices.stats.count}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-green-700">Average:</span>
                                                        <span className="font-bold ml-2">{formatCurrency(similarPrices.stats.avgPriceCents)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-green-700">Low:</span>
                                                        <span className="font-bold ml-2">{formatCurrency(similarPrices.stats.minPriceCents)}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-green-700">High:</span>
                                                        <span className="font-bold ml-2">{formatCurrency(similarPrices.stats.maxPriceCents)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-500">
                                                <p className="text-4xl mb-2">📈</p>
                                                <p>No similar items have been traded yet.</p>
                                                <p className="text-sm mt-1">Trade history will appear here as more trades complete.</p>
                                            </div>
                                        )}

                                        {similarPrices.signals.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-sm font-semibold text-gray-700">Recent Trades</h4>
                                                {similarPrices.signals.slice(0, 5).map(signal => (
                                                    <div key={signal.id} className="flex justify-between items-center bg-gray-50 rounded-lg p-3 text-sm">
                                                        <div>
                                                            <span className="font-medium">{signal.item_name}</span>
                                                            {signal.condition && (
                                                                <span className="text-gray-500 ml-2">({signal.condition})</span>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="font-bold">{formatCurrency(signal.implied_value_cents)}</span>
                                                            <span className="text-xs text-gray-500 block">{formatDate(signal.trade_completed_at)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'link' && (
                                    <div className="space-y-4">
                                        {/* Tab Description */}
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl border border-purple-100">
                                            <span className="text-2xl">🔗</span>
                                            <div>
                                                <h4 className="font-semibold text-gray-800">Get Auto-Updated Prices</h4>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    <strong>How it works:</strong> Type the name of your item below. When you see a match,
                                                    click "Link" and we'll automatically keep the price up-to-date for you!
                                                </p>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Search PriceCharting Catalog
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={async (e) => {
                                                        const query = e.target.value;
                                                        setSearchQuery(query);
                                                        setLinkMessage(null);
                                                    }}
                                                    placeholder="Start typing to search (e.g. EarthBound, Pokemon Red...)"
                                                    className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                                                />
                                                {/* Search status indicator */}
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {searching ? (
                                                        // Animated spinner
                                                        <svg className="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                    ) : searchQuery.length >= 2 ? (
                                                        <span className="text-green-500 text-xl">✓</span>
                                                    ) : (
                                                        <span className="text-gray-400 text-xl">🔍</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Autocomplete dropdown */}
                                            {searchResults.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                                    <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-500 font-medium">
                                                        Found {searchResults.length} products
                                                    </div>
                                                    {searchResults.slice(0, 8).map(product => (
                                                        <button
                                                            key={product.id}
                                                            type="button"
                                                            disabled={linking}
                                                            onClick={async () => {
                                                                if (!item) return;
                                                                setLinking(true);
                                                                setLinkMessage(null);
                                                                try {
                                                                    const result = await linkItemToProductApi(
                                                                        item.id,
                                                                        product.id,
                                                                        product.name,
                                                                        product.platform
                                                                    );
                                                                    if (result.success) {
                                                                        setLinkMessage(`✓ Linked to ${product.name}!`);
                                                                        setSearchResults([]);
                                                                        setSearchQuery('');
                                                                        loadData();
                                                                        if (onValuationUpdated) onValuationUpdated();
                                                                    } else {
                                                                        setLinkMessage(result.message);
                                                                    }
                                                                } catch (err) {
                                                                    setLinkMessage('Failed to link product');
                                                                } finally {
                                                                    setLinking(false);
                                                                }
                                                            }}
                                                            className="w-full flex justify-between items-center px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-0 disabled:opacity-50"
                                                        >
                                                            <div className="flex-1">
                                                                <span className="font-medium text-gray-800">{product.name}</span>
                                                                <span className="text-xs text-gray-500 block">{product.platform}</span>
                                                            </div>
                                                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-medium">
                                                                {linking ? '...' : 'Link'}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {linkMessage && (
                                            <p className={`text-sm ${linkMessage.includes('✓') ? 'text-green-600 font-medium' : 'text-gray-600'}`}>
                                                {linkMessage}
                                            </p>
                                        )}

                                        {!searching && searchQuery.length < 2 && searchResults.length === 0 && (
                                            <div className="text-center py-8 text-gray-500">
                                                <p className="text-4xl mb-2">🔗</p>
                                                <p className="font-medium">Link this item to a PriceCharting product</p>
                                                <p className="text-sm mt-1">for automated price updates</p>
                                            </div>
                                        )}

                                        {!searching && searchQuery.length >= 2 && searchResults.length === 0 && !linkMessage && (
                                            <div className="text-center py-8 text-gray-500">
                                                <p className="text-4xl mb-2">🤔</p>
                                                <p className="font-medium">No products found for "{searchQuery}"</p>
                                                <p className="text-sm mt-1">Try a different search term</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'override' && (
                                    <form onSubmit={handleSubmitOverride} className="space-y-4">
                                        {/* Tab Description */}
                                        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-100">
                                            <span className="text-2xl">✏️</span>
                                            <div>
                                                <h4 className="font-semibold text-gray-800">Think It's Worth More (or Less)?</h4>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    <strong>How it works:</strong> Enter what you think this item is worth, pick a reason,
                                                    and click Submit. Great for rare items or when the automatic price seems off.
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Your Valuation (USD)
                                            </label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2 text-gray-500">$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    value={overrideValue}
                                                    onChange={e => setOverrideValue(e.target.value)}
                                                    className="pl-8 w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    placeholder="0.00"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Reason
                                            </label>
                                            <select
                                                value={overrideReason}
                                                onChange={e => setOverrideReason(e.target.value)}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">Select a reason (optional)</option>
                                                <option value="unique_item">Unique/Rare Item</option>
                                                <option value="rare_variant">Rare Variant</option>
                                                <option value="disagree_with_api">Disagree with API Value</option>
                                                <option value="sentimental">Sentimental Value</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Justification
                                            </label>
                                            <textarea
                                                value={overrideJustification}
                                                onChange={e => setOverrideJustification(e.target.value)}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                rows={3}
                                                placeholder="Explain why this item is worth this amount (optional)"
                                            />
                                        </div>

                                        {error && <p className="text-sm text-red-500">{error}</p>}
                                        {submitSuccess && <p className="text-sm text-green-600">✓ Valuation submitted successfully!</p>}

                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {submitting ? 'Submitting...' : 'Submit Valuation'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </>
                    ) : null}

                    {/* Footer */}
                    <div className="bg-gray-50 px-6 py-3 flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ItemValuationModal;
