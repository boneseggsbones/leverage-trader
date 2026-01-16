import React, { useState, useEffect } from 'react';
import { Item } from '../types';
import { fetchItemValuations, fetchSimilarPrices, submitValueOverride, ItemValuationData, SimilarPricesData } from '../api/api';
import { useAuth } from '../context/AuthContext';
import ValuationBadge from './ValuationBadge';

interface ItemValuationModalProps {
    show: boolean;
    onClose: () => void;
    item: Item | null;
    onValuationUpdated?: () => void;
}

type TabType = 'overview' | 'history' | 'override';

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
                                        {/* API Valuations */}
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2">API Valuations</h4>
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

                                {activeTab === 'override' && (
                                    <form onSubmit={handleSubmitOverride} className="space-y-4">
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
