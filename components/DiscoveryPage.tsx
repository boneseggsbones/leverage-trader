import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchItems, getSearchSuggestions, getSearchStats, SearchFilters, SearchResultItem, SearchSuggestion, SearchStats } from '../api/api';
import { formatCurrency } from '../utils/currency';
import PageHeader from './PageHeader';
import { EmptySearch } from './EmptyState';

// =====================================================
// FILTER DROPDOWN COMPONENT (Zillow-style)
// =====================================================

interface FilterDropdownProps {
    label: string;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
    activeCount?: number;
    children: React.ReactNode;
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({
    label, isOpen, onToggle, onClose, activeCount, children
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={onToggle}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 text-sm font-semibold transition-all ${isOpen
                    ? 'bg-blue-600 text-white border-blue-600'
                    : activeCount
                        ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600'
                    }`}
            >
                {label}
                {activeCount ? (
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${isOpen ? 'bg-white/20' : 'bg-blue-600 text-white'
                        }`}>
                        {activeCount}
                    </span>
                ) : null}
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-50 top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 min-w-[280px] overflow-hidden">
                    {children}
                </div>
            )}
        </div>
    );
};

// =====================================================
// CATEGORY FILTER (Multi-select checkboxes)
// =====================================================

const CATEGORIES = [
    { value: 'Video Games', label: 'Video Games', icon: '🎮' },
    { value: 'Trading Card Games', label: 'Trading Cards', icon: '🃏' },
    { value: 'Sneakers', label: 'Sneakers', icon: '👟' },
    { value: 'Electronics', label: 'Electronics', icon: '📱' },
    { value: 'Collectibles', label: 'Collectibles', icon: '🏆' },
];

interface CategoryFilterProps {
    selected: string[];
    onChange: (categories: string[]) => void;
    onApply: () => void;
    stats?: SearchStats | null;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({ selected, onChange, onApply, stats }) => {
    const toggleCategory = (cat: string) => {
        if (selected.includes(cat)) {
            onChange(selected.filter(c => c !== cat));
        } else {
            onChange([...selected, cat]);
        }
    };

    const selectAll = () => onChange(CATEGORIES.map(c => c.value));
    const deselectAll = () => onChange([]);
    const allSelected = selected.length === CATEGORIES.length;

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Category</h4>
                <button
                    onClick={allSelected ? deselectAll : selectAll}
                    className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${allSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {allSelected && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </div>
                    {allSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div className="space-y-2">
                {CATEGORIES.map(cat => {
                    const count = stats?.categories.find(c => c.category === cat.value)?.count || 0;
                    return (
                        <label key={cat.value} className="flex items-center gap-3 cursor-pointer group py-1.5">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selected.includes(cat.value)
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
                                }`}>
                                {selected.includes(cat.value) && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <span className="text-lg">{cat.icon}</span>
                            <span className="flex-1 text-gray-700 dark:text-gray-300">{cat.label}</span>
                            <span className="text-xs text-gray-400">{count}</span>
                            <input
                                type="checkbox"
                                checked={selected.includes(cat.value)}
                                onChange={() => toggleCategory(cat.value)}
                                className="sr-only"
                            />
                        </label>
                    );
                })}
            </div>

            <button
                onClick={onApply}
                className="w-full mt-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
                Apply
            </button>
        </div>
    );
};

// =====================================================
// CONDITION FILTER (Multi-select checkboxes, same as Category)
// =====================================================

const CONDITIONS = [
    { value: 'NEW_SEALED', label: 'New / Sealed', icon: '✨' },
    { value: 'CIB', label: 'Complete in Box', icon: '📦' },
    { value: 'LOOSE', label: 'Loose', icon: '🎯' },
    { value: 'GRADED', label: 'Graded', icon: '🏆' },
];

interface ConditionFilterProps {
    selected: string[];
    onChange: (conditions: string[]) => void;
    onApply: () => void;
    results?: SearchResultItem[];
}

const ConditionFilter: React.FC<ConditionFilterProps> = ({ selected, onChange, onApply, results }) => {
    const toggleCondition = (cond: string) => {
        if (selected.includes(cond)) {
            onChange(selected.filter(c => c !== cond));
        } else {
            onChange([...selected, cond]);
        }
    };

    const selectAll = () => onChange(CONDITIONS.map(c => c.value));
    const deselectAll = () => onChange([]);
    const allSelected = selected.length === CONDITIONS.length;

    return (
        <div className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Condition</h4>
                <button
                    onClick={allSelected ? deselectAll : selectAll}
                    className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${allSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                        }`}>
                        {allSelected && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </div>
                    {allSelected ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div className="space-y-2">
                {CONDITIONS.map(cond => {
                    const count = results?.filter(r => r.condition === cond.value).length || 0;
                    return (
                        <label key={cond.value} className="flex items-center gap-3 cursor-pointer group py-1.5">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selected.includes(cond.value)
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'
                                }`}>
                                {selected.includes(cond.value) && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                )}
                            </div>
                            <span className="text-lg">{cond.icon}</span>
                            <span className="flex-1 text-gray-700 dark:text-gray-300">{cond.label}</span>
                            <span className="text-xs text-gray-400">{count}</span>
                            <input
                                type="checkbox"
                                checked={selected.includes(cond.value)}
                                onChange={() => toggleCondition(cond.value)}
                                className="sr-only"
                            />
                        </label>
                    );
                })}
            </div>

            <button
                onClick={onApply}
                className="w-full mt-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
                Apply
            </button>
        </div>
    );
};

// =====================================================
// PRICE FILTER (Min/Max dropdowns)
// =====================================================

const PRICE_OPTIONS = [
    { value: '', label: 'Any' },
    { value: '0', label: '$0' },
    { value: '2500', label: '$25' },
    { value: '5000', label: '$50' },
    { value: '10000', label: '$100' },
    { value: '25000', label: '$250' },
    { value: '50000', label: '$500' },
    { value: '100000', label: '$1,000' },
    { value: '250000', label: '$2,500' },
    { value: '500000', label: '$5,000' },
];

interface PriceFilterProps {
    minPrice: string;
    maxPrice: string;
    onMinChange: (val: string) => void;
    onMaxChange: (val: string) => void;
    onApply: () => void;
}

const PriceFilter: React.FC<PriceFilterProps> = ({ minPrice, maxPrice, onMinChange, onMaxChange, onApply }) => {
    return (
        <div className="p-4">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">Price Range</h4>

            <div className="flex items-center gap-3">
                <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Minimum</label>
                    <select
                        value={minPrice}
                        onChange={e => onMinChange(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
                    >
                        {PRICE_OPTIONS.map(opt => (
                            <option key={`min-${opt.value}`} value={opt.value}>
                                {opt.value === '' ? 'No min' : opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <span className="text-gray-400 mt-5">–</span>

                <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Maximum</label>
                    <select
                        value={maxPrice}
                        onChange={e => onMaxChange(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
                    >
                        {PRICE_OPTIONS.map(opt => (
                            <option key={`max-${opt.value}`} value={opt.value}>
                                {opt.value === '' ? 'No max' : opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <button
                onClick={onApply}
                className="w-full mt-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
                Apply
            </button>
        </div>
    );
};

// =====================================================
// LOCATION FILTER
// =====================================================

interface LocationFilterProps {
    city: string;
    state: string;
    onCityChange: (val: string) => void;
    onStateChange: (val: string) => void;
    onApply: () => void;
}

const LocationFilter: React.FC<LocationFilterProps> = ({ city, state, onCityChange, onStateChange, onApply }) => {
    return (
        <div className="p-4">
            <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">Location</h4>

            <div className="space-y-3">
                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">City</label>
                    <input
                        type="text"
                        value={city}
                        onChange={e => onCityChange(e.target.value)}
                        placeholder="Enter city name"
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">State</label>
                    <input
                        type="text"
                        value={state}
                        onChange={e => onStateChange(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="TX"
                        maxLength={2}
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:outline-none uppercase"
                    />
                </div>
            </div>

            <button
                onClick={onApply}
                className="w-full mt-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
                Apply
            </button>
        </div>
    );
};

// =====================================================
// SEARCH RESULT CARD
// =====================================================

interface ResultCardProps {
    item: SearchResultItem;
    onItemClick: (item: SearchResultItem) => void;
}

const ResultCard: React.FC<ResultCardProps> = ({ item, onItemClick }) => {
    const navigate = useNavigate();
    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/')
        ? `http://localhost:4000${item.imageUrl}`
        : item.imageUrl;

    const handleOwnerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/profile/${item.owner.id}`);
    };

    return (
        <div
            onClick={() => onItemClick(item)}
            className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
        >
            {/* Image */}
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 relative overflow-hidden">
                {imageUrl ? (
                    <img src={imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>
                )}
                {/* Category badge */}
                {item.category && (
                    <span className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-xs font-medium text-white">
                        {item.category}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white truncate">{item.name}</h3>
                <div className="mt-1 flex items-center justify-between">
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {item.estimatedMarketValue ? formatCurrency(item.estimatedMarketValue) : 'No price'}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                        {item.condition?.replace('_', ' ')}
                    </span>
                </div>

                {/* Owner */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={handleOwnerClick}
                        className="flex items-center gap-2 w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                    >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                            {item.owner.profilePictureUrl ? (
                                <img src={item.owner.profilePictureUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                item.owner.name?.charAt(0).toUpperCase()
                            )}
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">
                            {item.owner.name}
                        </span>
                        {item.owner.city && item.owner.state && (
                            <span className="text-xs text-gray-400">
                                {item.owner.city}, {item.owner.state}
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// =====================================================
// MAIN DISCOVERY PAGE
// =====================================================

const DiscoveryPage: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0, hasMore: false });
    const [stats, setStats] = useState<SearchStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState(searchParams.get('q') || '');
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Filter dropdown states
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    // Local filter states (before Apply)
    // Default: all categories selected (no filtering)
    const allCategoryValues = CATEGORIES.map(c => c.value);
    const [localCategories, setLocalCategories] = useState<string[]>(() => {
        const cat = searchParams.get('category');
        // If no URL param, default to all selected (no filter)
        return cat ? cat.split(',') : allCategoryValues;
    });
    // Default: all conditions selected (no filtering)
    const allConditionValues = CONDITIONS.map(c => c.value);
    const [localConditions, setLocalConditions] = useState<string[]>(() => {
        const cond = searchParams.get('condition');
        return cond ? cond.split(',') : allConditionValues;
    });
    const [localMinPrice, setLocalMinPrice] = useState(searchParams.get('minPrice') || '');
    const [localMaxPrice, setLocalMaxPrice] = useState(searchParams.get('maxPrice') || '');
    const [localCity, setLocalCity] = useState(searchParams.get('city') || '');
    const [localState, setLocalState] = useState(searchParams.get('state') || '');

    // Refs to skip initial render for real-time filtering
    const isInitialCategoryRender = useRef(true);
    const isInitialConditionRender = useRef(true);

    // Filters from URL
    const filters: SearchFilters = useMemo(() => ({
        q: searchParams.get('q') || undefined,
        category: searchParams.get('category') || undefined,
        condition: searchParams.get('condition') || undefined,
        minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
        maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
        city: searchParams.get('city') || undefined,
        state: searchParams.get('state') || undefined,
        sortBy: (searchParams.get('sortBy') as any) || 'newest',
        page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
        excludeUserId: currentUser?.id
    }), [searchParams, currentUser?.id]);

    // Load stats on mount
    useEffect(() => {
        const loadStats = async () => {
            try {
                const data = await getSearchStats(currentUser?.id);
                setStats(data);
            } catch (err) {
                console.error('Failed to load stats:', err);
            }
        };
        loadStats();
    }, [currentUser?.id]);

    // Search when filters change
    useEffect(() => {
        const doSearch = async () => {
            setLoading(true);
            try {
                const result = await searchItems(filters);
                setResults(result.items);
                setPagination(result.pagination);
            } catch (err) {
                console.error('Search failed:', err);
                setResults([]);
            } finally {
                setLoading(false);
            }
        };
        doSearch();
    }, [filters]);

    // Autocomplete suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (searchText.length < 2) {
                setSuggestions([]);
                return;
            }
            const results = await getSearchSuggestions(searchText);
            setSuggestions(results);
        };
        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    // Real-time filtering: apply category changes immediately
    useEffect(() => {
        if (isInitialCategoryRender.current) {
            isInitialCategoryRender.current = false;
            return;
        }
        const isAll = localCategories.length === allCategoryValues.length;
        const currentUrlValue = searchParams.get('category');
        const newValue = isAll || localCategories.length === 0 ? null : localCategories.join(',');

        // Only update URL if the value actually changed
        if (currentUrlValue === newValue) return;

        const newParams = new URLSearchParams(searchParams);
        if (newValue === null) {
            newParams.delete('category');
        } else {
            newParams.set('category', newValue);
        }
        newParams.delete('page');
        setSearchParams(newParams, { replace: true });
    }, [localCategories]);

    // Real-time filtering: apply condition changes immediately
    useEffect(() => {
        if (isInitialConditionRender.current) {
            isInitialConditionRender.current = false;
            return;
        }
        const isAll = localConditions.length === allConditionValues.length;
        const currentUrlValue = searchParams.get('condition');
        const newValue = isAll || localConditions.length === 0 ? null : localConditions.join(',');

        // Only update URL if the value actually changed
        if (currentUrlValue === newValue) return;

        const newParams = new URLSearchParams(searchParams);
        if (newValue === null) {
            newParams.delete('condition');
        } else {
            newParams.set('condition', newValue);
        }
        newParams.delete('page');
        setSearchParams(newParams, { replace: true });
    }, [localConditions]);

    // Apply filters to URL
    const applyFilters = useCallback((updates: Record<string, string | undefined>) => {
        const newParams = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                newParams.delete(key);
            } else {
                newParams.set(key, value);
            }
        });
        newParams.delete('page'); // Reset pagination
        setSearchParams(newParams, { replace: true });
        setOpenDropdown(null);
    }, [searchParams, setSearchParams]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters({ q: searchText || undefined });
        setShowSuggestions(false);
    };

    const handleSuggestionClick = (suggestion: SearchSuggestion) => {
        if (suggestion.type === 'category') {
            setLocalCategories([suggestion.text]);
            applyFilters({ category: suggestion.text });
        } else {
            setSearchText(suggestion.text);
            applyFilters({ q: suggestion.text });
        }
        setShowSuggestions(false);
    };

    const clearAllFilters = () => {
        // Reset local UI states
        setSearchText('');
        setLocalCategories(allCategoryValues); // Reset to all selected
        setLocalConditions(allConditionValues); // Reset to all selected
        setLocalMinPrice('');
        setLocalMaxPrice('');
        setLocalCity('');
        setLocalState('');
        // Clear URL params - this triggers the search via useEffect on filters
        setSearchParams({}, { replace: true });
    };

    const handleItemClick = (item: SearchResultItem) => {
        navigate(`/trade/${item.owner.id}?offer=${item.id}`);
    };

    const handleSortChange = (sortBy: string) => {
        applyFilters({ sortBy });
    };

    const handlePageChange = (page: number) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('page', String(page));
        setSearchParams(newParams, { replace: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Count active filters (categories/conditions only count if NOT all selected)
    const isCategoryFiltered = localCategories.length > 0 && localCategories.length < allCategoryValues.length;
    const isConditionFiltered = localConditions.length > 0 && localConditions.length < allConditionValues.length;
    const activeFilterCount = [
        isCategoryFiltered,
        isConditionFiltered,
        localMinPrice || localMaxPrice,
        localCity || localState
    ].filter(Boolean).length;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <PageHeader title="Discover" description="Find items to trade" />

            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* Search Bar */}
                <div className="relative mb-4">
                    <form onSubmit={handleSearch} className="relative">
                        <input
                            type="text"
                            value={searchText}
                            onChange={e => { setSearchText(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            placeholder="Search for items..."
                            className="w-full px-5 py-4 pr-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                        />
                        <button
                            type="submit"
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </button>
                    </form>

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onMouseDown={() => handleSuggestionClick(s)}
                                    className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3"
                                >
                                    {s.type === 'category' ? (
                                        <span className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">📂</span>
                                    ) : (
                                        <span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">🔍</span>
                                    )}
                                    <div>
                                        <p className="text-gray-900 dark:text-white font-medium">{s.text}</p>
                                        <p className="text-xs text-gray-500">{s.type === 'category' ? 'Category' : 'Search term'}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Zillow-style Filter Bar */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    {/* Category Dropdown */}
                    <FilterDropdown
                        label="Category"
                        isOpen={openDropdown === 'category'}
                        onToggle={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
                        onClose={() => setOpenDropdown(null)}
                        activeCount={isCategoryFiltered ? localCategories.length : undefined}
                    >
                        <CategoryFilter
                            selected={localCategories}
                            onChange={setLocalCategories}
                            onApply={() => {
                                // If all selected, clear the filter (show everything)
                                const isAll = localCategories.length === allCategoryValues.length;
                                applyFilters({ category: isAll ? undefined : localCategories.join(',') });
                            }}
                            stats={stats}
                        />
                    </FilterDropdown>

                    {/* Condition Dropdown */}
                    <FilterDropdown
                        label="Condition"
                        isOpen={openDropdown === 'condition'}
                        onToggle={() => setOpenDropdown(openDropdown === 'condition' ? null : 'condition')}
                        onClose={() => setOpenDropdown(null)}
                        activeCount={isConditionFiltered ? localConditions.length : undefined}
                    >
                        <ConditionFilter
                            selected={localConditions}
                            onChange={setLocalConditions}
                            onApply={() => {
                                // If all selected, clear the filter (show everything)
                                const isAll = localConditions.length === allConditionValues.length;
                                applyFilters({ condition: isAll ? undefined : localConditions.join(',') });
                            }}
                            results={results}
                        />
                    </FilterDropdown>

                    {/* Price Dropdown */}
                    <FilterDropdown
                        label="Price"
                        isOpen={openDropdown === 'price'}
                        onToggle={() => setOpenDropdown(openDropdown === 'price' ? null : 'price')}
                        onClose={() => setOpenDropdown(null)}
                        activeCount={(localMinPrice || localMaxPrice) ? 1 : undefined}
                    >
                        <PriceFilter
                            minPrice={localMinPrice}
                            maxPrice={localMaxPrice}
                            onMinChange={setLocalMinPrice}
                            onMaxChange={setLocalMaxPrice}
                            onApply={() => applyFilters({ minPrice: localMinPrice || undefined, maxPrice: localMaxPrice || undefined })}
                        />
                    </FilterDropdown>

                    {/* Location Dropdown */}
                    <FilterDropdown
                        label="Location"
                        isOpen={openDropdown === 'location'}
                        onToggle={() => setOpenDropdown(openDropdown === 'location' ? null : 'location')}
                        onClose={() => setOpenDropdown(null)}
                        activeCount={(localCity || localState) ? 1 : undefined}
                    >
                        <LocationFilter
                            city={localCity}
                            state={localState}
                            onCityChange={setLocalCity}
                            onStateChange={setLocalState}
                            onApply={() => applyFilters({ city: localCity || undefined, state: localState || undefined })}
                        />
                    </FilterDropdown>

                    {/* Clear all button */}
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearAllFilters}
                            className="px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:underline"
                        >
                            Reset all filters
                        </button>
                    )}

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Sort */}
                    <select
                        value={filters.sortBy || 'newest'}
                        onChange={e => handleSortChange(e.target.value)}
                        className="px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300 font-medium"
                    >
                        <option value="newest">Newest First</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                    </select>
                </div>

                {/* Results Count */}
                <div className="mb-4">
                    <p className="text-gray-600 dark:text-gray-400">
                        {loading ? 'Searching...' : `${pagination.total} items found`}
                    </p>
                </div>

                {/* Results Grid (Full Width) */}
                {loading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden animate-pulse">
                                <div className="aspect-square bg-gray-200 dark:bg-gray-700" />
                                <div className="p-4 space-y-3">
                                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : results.length === 0 ? (
                    <EmptySearch query={filters.q || ''} />
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {results.map(item => (
                                <ResultCard key={item.id} item={item} onItemClick={handleItemClick} />
                            ))}
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="mt-8 flex items-center justify-center gap-2">
                                <button
                                    onClick={() => handlePageChange(pagination.page - 1)}
                                    disabled={pagination.page === 1}
                                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Previous
                                </button>
                                <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    onClick={() => handlePageChange(pagination.page + 1)}
                                    disabled={!pagination.hasMore}
                                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default DiscoveryPage;
