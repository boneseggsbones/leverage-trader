import React, { useState, useEffect } from 'react';
import { Item } from '../types';
import { fetchItemValuations, submitValueOverride, refreshItemValuation as refreshItemValuationApi, searchExternalProducts, linkItemToProduct as linkItemToProductApi, ExternalProduct, ItemValuationData } from '../api/api';
import { useAuth } from '../context/AuthContext';
import ValuationBadge from './ValuationBadge';

interface ItemDetailModalProps {
    show: boolean;
    onClose: () => void;
    item: Item | null;
    onItemUpdated?: () => void;
    onDeleteItem?: (itemId: number) => void;
    onEditItem?: (item: { name: string; description: string; image: File | null, estimatedMarketValueDollars: number, condition?: string }) => void;
}

type ActiveTab = 'details' | 'pricing';

const CONDITION_GRADES = [
    { value: 'MINT', label: 'Mint', icon: '💎' },
    { value: 'NEAR_MINT', label: 'Near Mint', icon: '✨' },
    { value: 'EXCELLENT', label: 'Excellent', icon: '⭐' },
    { value: 'VERY_GOOD', label: 'Very Good', icon: '👍' },
    { value: 'GOOD', label: 'Good', icon: '👌' },
    { value: 'FAIR', label: 'Fair', icon: '🔧' },
    { value: 'POOR', label: 'Poor', icon: '⚠️' },
    { value: 'GRADED', label: 'Graded', icon: '🏆' },
];

// Helper to get best price from ExternalProduct
const getProductPrice = (product: ExternalProduct): number | null => {
    // Priority: loosePrice > cibPrice > newPrice
    if (product.loosePrice && product.loosePrice > 0) return product.loosePrice;
    if (product.cibPrice && product.cibPrice > 0) return product.cibPrice;
    if (product.newPrice && product.newPrice > 0) return product.newPrice;
    return null;
};

const formatPrice = (cents: number | null | undefined): string => {
    if (cents === null || cents === undefined) return '—';
    return `$${(cents / 100).toFixed(2)}`;
};

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ show, onClose, item, onItemUpdated, onDeleteItem, onEditItem }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ActiveTab>('details');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Edit state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [condition, setCondition] = useState('GOOD');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    // Valuation state
    const [valuationData, setValuationData] = useState<ItemValuationData | null>(null);
    const [overrideValue, setOverrideValue] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Auto-price state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ExternalProduct[]>([]);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState(false);
    const [linkSuccess, setLinkSuccess] = useState(false);

    // Load item data when modal opens
    useEffect(() => {
        if (show && item) {
            setName(item.name);
            setDescription((item as any).description || '');
            setCondition((item as any).condition || 'GOOD');
            setImagePreview((item as any).imageUrl ?
                ((item as any).imageUrl.startsWith('/') ? `http://localhost:4000${(item as any).imageUrl}` : (item as any).imageUrl)
                : null);
            setImage(null);
            setHasChanges(false);
            setSearchQuery('');
            setSearchResults([]);
            setError(null);
            loadValuation();
        }
    }, [show, item]);

    // Debounced product search
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
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

    const loadValuation = async () => {
        if (!item) return;
        setLoading(true);
        try {
            const data = await fetchItemValuations(item.id);
            setValuationData(data);
            if (data?.item?.current_emv_cents) {
                setOverrideValue((data.item.current_emv_cents / 100).toFixed(2));
            }
        } catch (err) {
            console.error('Error loading valuation:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImage(file);
            setHasChanges(true);
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSaveDetails = async () => {
        if (!onEditItem || !hasChanges) return;
        setSaving(true);
        try {
            const valueCents = valuationData?.item?.current_emv_cents || 0;
            await onEditItem({
                name,
                description,
                image,
                estimatedMarketValueDollars: valueCents / 100,
                condition
            });
            setHasChanges(false);
            onItemUpdated?.();
        } catch (err) {
            setError('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    const handleSetPrice = async () => {
        if (!item || !currentUser) return;
        const valueCents = Math.round(parseFloat(overrideValue) * 100);
        if (isNaN(valueCents) || valueCents <= 0) return;

        setSubmitting(true);
        setError(null);
        try {
            await submitValueOverride(item.id, Number(currentUser.id), valueCents);
            setSubmitSuccess(true);
            await loadValuation();
            onItemUpdated?.();
            setTimeout(() => setSubmitSuccess(false), 2000);
        } catch (err) {
            setError('Failed to update price');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRefreshPrice = async () => {
        if (!item) return;
        setRefreshing(true);
        setError(null);
        try {
            await refreshItemValuationApi(item.id);
            await loadValuation();
            onItemUpdated?.();
        } catch (err) {
            setError('Failed to refresh price');
        } finally {
            setRefreshing(false);
        }
    };

    const handleLinkProduct = async (product: ExternalProduct) => {
        if (!item) return;
        setLinking(true);
        setError(null);
        try {
            await linkItemToProductApi(
                item.id,
                product.id,
                product.name,
                product.platform || 'Unknown'
            );
            setLinkSuccess(true);
            setSearchQuery('');
            setSearchResults([]);
            await loadValuation();
            onItemUpdated?.();
            setTimeout(() => setLinkSuccess(false), 2000);
        } catch (err) {
            setError('Failed to link product');
        } finally {
            setLinking(false);
        }
    };

    const formatCurrency = (cents: number | null | undefined) => {
        if (cents === null || cents === undefined) return '—';
        const dollars = cents / 100;
        return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (!show || !item) return null;

    const emvSource = valuationData?.item?.emv_source || (item as any).emv_source;
    const isLinked = emvSource === 'api' || emvSource === 'consolidated';
    const currentValue = valuationData?.item?.current_emv_cents ?? (item as any).estimatedMarketValue;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 px-6 pt-6 pb-6 shrink-0">
                    <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all z-10">✕</button>

                    <div className="flex flex-col items-center text-center">
                        {/* Image */}
                        <div className="relative group mb-4">
                            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-700 shadow-xl ring-2 ring-white/10 flex items-center justify-center">
                                {imagePreview ? (
                                    <img src={imagePreview} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-3xl">📦</span>
                                )}
                            </div>
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                                <span className="text-white text-xs font-medium">Change</span>
                                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                            </label>
                        </div>

                        <h2 className="text-white text-lg font-semibold">{name}</h2>

                        {/* Current Value + Badge */}
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-2xl font-bold text-white">
                                {loading ? '...' : formatCurrency(currentValue)}
                            </span>
                            {emvSource && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${isLinked ? 'bg-emerald-500/30 text-emerald-300' :
                                        emvSource === 'user_override' ? 'bg-violet-500/30 text-violet-300' :
                                            'bg-slate-600/50 text-slate-300'
                                    }`}>
                                    {isLinked ? '✓ Linked' : emvSource === 'user_override' ? 'Custom' : 'Manual'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`flex-1 py-3 text-sm font-medium transition-all ${activeTab === 'details'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        📝 Details
                    </button>
                    <button
                        onClick={() => setActiveTab('pricing')}
                        className={`flex-1 py-3 text-sm font-medium transition-all ${activeTab === 'pricing'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        💰 Pricing
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto flex-1 p-5">
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => { setName(e.target.value); setHasChanges(true); }}
                                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => { setDescription(e.target.value); setHasChanges(true); }}
                                    rows={2}
                                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                                    placeholder="Add a description..."
                                />
                            </div>

                            {/* Condition */}
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1.5">Condition</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {CONDITION_GRADES.map((grade) => (
                                        <button
                                            key={grade.value}
                                            onClick={() => { setCondition(grade.value); setHasChanges(true); }}
                                            className={`p-2 rounded-xl text-center transition-all ${condition === grade.value
                                                ? 'bg-blue-100 dark:bg-blue-900/50 border-2 border-blue-500 text-blue-700 dark:text-blue-300'
                                                : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                                                }`}
                                        >
                                            <span className="text-base">{grade.icon}</span>
                                            <p className="text-[10px] mt-0.5 font-medium truncate">{grade.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Save Button */}
                            {hasChanges && (
                                <button
                                    onClick={handleSaveDetails}
                                    disabled={saving}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            )}
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-5">
                            {/* If linked, show refresh option */}
                            {isLinked ? (
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 text-center">
                                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3">
                                        ✓ This item is linked to live market data
                                    </p>
                                    <button
                                        onClick={handleRefreshPrice}
                                        disabled={refreshing}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                    >
                                        {refreshing ? 'Refreshing...' : '🔄 Refresh Price'}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Link to Market Data */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Link to Market Data</h3>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onFocus={() => { if (!searchQuery) setSearchQuery(name); }}
                                                placeholder="Search for product..."
                                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-20"
                                            />
                                            {!searchQuery && (
                                                <button
                                                    onClick={() => setSearchQuery(name)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    Use name
                                                </button>
                                            )}
                                        </div>

                                        {searching && (
                                            <p className="text-xs text-gray-500 mt-2 flex items-center gap-2">
                                                <span className="animate-spin">⏳</span> Searching...
                                            </p>
                                        )}

                                        {searchResults.length > 0 && (
                                            <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                {searchResults.slice(0, 5).map((product, idx) => {
                                                    const price = getProductPrice(product);
                                                    return (
                                                        <button
                                                            key={product.id}
                                                            onClick={() => handleLinkProduct(product)}
                                                            disabled={linking}
                                                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all flex justify-between items-center gap-3 ${idx > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''
                                                                }`}
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm text-gray-800 dark:text-white truncate">{product.name}</p>
                                                                <p className="text-xs text-gray-400">{product.platform}</p>
                                                            </div>
                                                            {price !== null ? (
                                                                <span className="text-sm font-bold text-green-600 whitespace-nowrap">
                                                                    {formatPrice(price)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">No price</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {linkSuccess && (
                                            <p className="text-xs text-green-600 mt-2 font-medium">✓ Linked successfully!</p>
                                        )}
                                    </div>

                                    {/* Divider */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                        <span className="text-xs text-gray-400">or set manually</span>
                                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                    </div>
                                </>
                            )}

                            {/* Manual Price */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Set Custom Price</h3>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={overrideValue}
                                            onChange={(e) => setOverrideValue(e.target.value)}
                                            className="w-full pl-8 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSetPrice}
                                        disabled={submitting || !overrideValue}
                                        className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50"
                                    >
                                        {submitting ? '...' : 'Set'}
                                    </button>
                                </div>
                                {submitSuccess && (
                                    <p className="text-xs text-green-600 mt-2 font-medium">✓ Price updated!</p>
                                )}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ItemDetailModal;
