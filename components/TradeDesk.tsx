import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { fetchUser, proposeTrade } from '../api/api';
import { User, Item } from '../types.ts';
import ItemCard from './ItemCard.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import ItemDetailModal from './ItemDetailModal.tsx';
import { formatCurrency, dollarsToCents } from '../utils/currency.ts';

const TradeDesk: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { otherUserId } = useParams<{ otherUserId: string }>();
    const { addNotification } = useNotification();

    const [otherUser, setOtherUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Trade state
    const [currentUserItems, setCurrentUserItems] = useState<Item[]>([]);
    const [otherUserItems, setOtherUserItems] = useState<Item[]>([]);
    const [currentUserCash, setCurrentUserCash] = useState<number>(0);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Item detail preview state
    const [previewItem, setPreviewItem] = useState<Item | null>(null);
    const [previewOwner, setPreviewOwner] = useState<'current' | 'other'>('current');

    useEffect(() => {
        if (!otherUserId) {
            setError("No user selected for trade.");
            setIsLoading(false);
            return;
        }

        const loadOtherUser = async () => {
            try {
                const userId = parseInt(otherUserId, 10);
                if (isNaN(userId)) {
                    setError("Invalid user ID.");
                    return;
                }
                const user = await fetchUser(userId);
                if (user) {
                    setOtherUser(user);
                } else {
                    setError("Could not find the user to trade with.");
                }
            } catch (err) {
                setError("Failed to load user data.");
            } finally {
                setIsLoading(false);
            }
        };

        loadOtherUser();
    }, [otherUserId]);

    if (!currentUser) {
        navigate('/');
        return null;
    }

    const toggleItemSelection = (item: Item, party: 'current' | 'other') => {
        if (party === 'current') {
            setCurrentUserItems(prev =>
                prev.find(i => i.id === item.id)
                    ? prev.filter(i => i.id !== item.id)
                    : [...prev, item]
            );
        } else {
            setOtherUserItems(prev =>
                prev.find(i => i.id === item.id)
                    ? prev.filter(i => i.id !== item.id)
                    : [...prev, item]
            );
        }
    };

    const handleProposeTrade = async () => {
        if (!otherUser || isSubmitting || !currentUser) return;

        if (currentUserItems.length === 0 && currentUserCash === 0) {
            addNotification("You must offer at least one item or some cash.", 'warning');
            return;
        }

        setIsSubmitting(true);
        try {
            const { updatedProposer } = await proposeTrade(
                currentUser.id,
                otherUser.id,
                currentUserItems.map(item => item.id),
                otherUserItems.map(item => item.id),
                dollarsToCents(currentUserCash)
            );
            updateUser(updatedProposer);
            addNotification("Trade proposed successfully!", 'success');
            navigate('/');
        } catch (err) {
            addNotification("Failed to propose trade. Please try again.", 'error');
            console.error(err);
        } finally {
            setIsSubmitting(false);
            setIsModalOpen(false);
        }
    };

    // Calculate values
    const calculateValue = (items: Item[], cashInDollars: number): number => {
        return items.reduce((sum, item) => sum + (item.estimatedMarketValue || 0), 0) + dollarsToCents(cashInDollars);
    };

    const yourOfferValue = calculateValue(currentUserItems, currentUserCash);
    const theirOfferValue = calculateValue(otherUserItems, 0);
    const valueDifference = yourOfferValue - theirOfferValue;
    const currentUserCashInDollars = currentUser.balance / 100;

    const getItemImageUrl = (item: Item) => {
        return item.imageUrl && item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl;
    };

    // Offer Zone Component - displays items in the trade offer
    const OfferZone = ({ title, items, isYours }: { title: string; items: Item[]; isYours: boolean }) => {
        return (
            <div
                className={`flex-1 rounded-2xl border-2 border-dashed p-4 min-h-[180px] transition-all ${items.length > 0
                    ? isYours ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'
                    : 'border-slate-200 bg-slate-50'
                    }`}
            >
                <h3 className={`text-sm font-semibold mb-3 ${isYours ? 'text-orange-700' : 'text-green-700'
                    }`}>{title}</h3>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[120px] text-slate-400">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mb-2">
                            <span className="text-2xl text-slate-300">+</span>
                        </div>
                        <p className="text-xs text-center">Click items below to add</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {items.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm border border-slate-200 cursor-pointer hover:border-red-300 hover:bg-red-50 transition-colors"
                                onClick={() => toggleItemSelection(item, isYours ? 'current' : 'other')}
                                title="Click to remove"
                            >
                                <img src={getItemImageUrl(item)} alt={item.name} className="w-8 h-8 rounded object-cover" />
                                <div>
                                    <p className="text-sm font-medium text-slate-700 truncate max-w-[100px]">{item.name}</p>
                                    <p className="text-xs text-slate-500">{formatCurrency(item.estimatedMarketValue || 0)}</p>
                                </div>
                                <span className="text-red-400 text-xs ml-1">✕</span>
                            </div>
                        ))}
                        {isYours && currentUserCash > 0 && (
                            <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm border border-green-200">
                                <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center font-bold text-green-700">$</div>
                                <div>
                                    <p className="text-sm font-medium text-slate-700">Cash</p>
                                    <p className="text-xs text-green-600">{formatCurrency(dollarsToCents(currentUserCash))}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Custom Trade Item Card with preview and quick-add
    const TradeItemCard = ({
        item,
        isSelected,
        onPreview,
        onToggle,
        accentColor
    }: {
        item: Item;
        isSelected: boolean;
        onPreview: () => void;
        onToggle: () => void;
        accentColor: 'orange' | 'green';
    }) => {
        const imageUrl = item.imageUrl && item.imageUrl.startsWith('/')
            ? `http://localhost:4000${item.imageUrl}`
            : item.imageUrl;

        return (
            <div
                className={`relative group bg-white rounded-xl border-2 transition-all duration-200 overflow-hidden cursor-pointer ${isSelected
                    ? accentColor === 'orange'
                        ? 'border-orange-400 ring-2 ring-orange-200 shadow-lg'
                        : 'border-green-400 ring-2 ring-green-200 shadow-lg'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }`}
                onClick={onPreview}
            >
                {/* Image - larger and more prominent */}
                <div className="aspect-square bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">📦</div>
                    )}
                </div>

                {/* Info */}
                <div className="p-3">
                    <h4 className="font-semibold text-sm text-slate-800 line-clamp-2 leading-tight mb-1">{item.name}</h4>
                    <p className="text-sm font-medium text-slate-600">{formatCurrency(item.estimatedMarketValue || 0)}</p>
                </div>

                {/* Quick-add button - visible on hover, always visible if selected */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg transition-all ${isSelected
                        ? 'bg-red-500 hover:bg-red-600 opacity-100'
                        : accentColor === 'orange'
                            ? 'bg-orange-500 hover:bg-orange-600 opacity-0 group-hover:opacity-100'
                            : 'bg-green-500 hover:bg-green-600 opacity-0 group-hover:opacity-100'
                        }`}
                    title={isSelected ? 'Remove from trade' : 'Add to trade'}
                >
                    {isSelected ? '−' : '+'}
                </button>

                {/* Selected checkmark - top right */}
                {isSelected && (
                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${accentColor === 'orange' ? 'bg-orange-500' : 'bg-green-500'
                        }`}>
                        ✓
                    </div>
                )}

                {/* Hover hint */}
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {isSelected ? '✓ Added' : 'Click for details'}
                </div>
            </div>
        );
    };

    // Collection Grid Component - now with larger cards
    const CollectionGrid = ({
        title,
        user,
        selectedItems,
        onSelect,
        onPreview,
        isYours
    }: {
        title: string;
        user: User;
        selectedItems: Item[];
        onSelect: (item: Item) => void;
        onPreview: (item: Item) => void;
        isYours: boolean;
    }) => (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className={`text-base font-semibold ${isYours ? 'text-orange-700' : 'text-green-700'}`}>
                    {title}
                </h3>
                <span className="text-xs text-slate-500">{user.inventory.length} items</span>
            </div>
            {user.inventory.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {user.inventory.map(item => (
                        <TradeItemCard
                            key={item.id}
                            item={item}
                            isSelected={!!selectedItems.find(i => i.id === item.id)}
                            onPreview={() => onPreview(item)}
                            onToggle={() => onSelect(item)}
                            accentColor={isYours ? 'orange' : 'green'}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-slate-400">
                    <div className="text-4xl mb-2">📦</div>
                    <p className="text-sm">No items available</p>
                </div>
            )}
        </div>
    );

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!otherUser) return <div className="p-8 text-center text-red-500">Could not load trade partner.</div>;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            {/* Minimal Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="text-slate-500 hover:text-slate-700 transition-colors"
                        >
                            ← Back
                        </button>
                        <div className="h-5 w-px bg-slate-200" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                {otherUser.name.charAt(0)}
                            </div>
                            <h1 className="text-lg font-semibold text-slate-800">Trade with {otherUser.name}</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-6">
                {/* Trade Builder - Side by Side Offer Zones */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex flex-col md:flex-row gap-4 items-stretch">
                        {/* Your Offer */}
                        <OfferZone title="You're Offering" items={currentUserItems} isYours={true} />

                        {/* Balance Scale Center */}
                        <div className="flex flex-col items-center justify-center px-4 py-2">
                            <div className="text-3xl mb-2">⚖️</div>
                            <div className="text-center">
                                <div className="flex items-center gap-2 text-sm font-mono">
                                    <span className={`font-semibold ${yourOfferValue > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                                        {formatCurrency(yourOfferValue)}
                                    </span>
                                    <span className="text-slate-300">↔</span>
                                    <span className={`font-semibold ${theirOfferValue > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                                        {formatCurrency(theirOfferValue)}
                                    </span>
                                </div>
                                {(yourOfferValue > 0 || theirOfferValue > 0) && (
                                    <p className={`text-xs mt-1 ${valueDifference === 0 ? 'text-slate-500' :
                                        valueDifference > 0 ? 'text-orange-500' : 'text-green-500'
                                        }`}>
                                        {valueDifference === 0 ? 'Balanced' :
                                            valueDifference > 0 ? `You're offering ${formatCurrency(Math.abs(valueDifference))} more` :
                                                `You're receiving ${formatCurrency(Math.abs(valueDifference))} more`}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Their Offer */}
                        <OfferZone title={`${otherUser.name}'s Offer`} items={otherUserItems} isYours={false} />
                    </div>
                </div>

                {/* Collections - Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <CollectionGrid
                            title="Your Collection"
                            user={currentUser}
                            selectedItems={currentUserItems}
                            onSelect={(item) => toggleItemSelection(item, 'current')}
                            onPreview={(item) => { setPreviewItem(item); setPreviewOwner('current'); }}
                            isYours={true}
                        />
                    </div>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <CollectionGrid
                            title={`${otherUser.name}'s Collection`}
                            user={otherUser}
                            selectedItems={otherUserItems}
                            onSelect={(item) => toggleItemSelection(item, 'other')}
                            onPreview={(item) => { setPreviewItem(item); setPreviewOwner('other'); }}
                            isYours={false}
                        />
                    </div>
                </div>
            </div>

            {/* Floating Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-200 shadow-lg">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                    {/* Cash Input */}
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600">Add cash:</span>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                            <input
                                type="number"
                                value={currentUserCash || ''}
                                onChange={(e) => setCurrentUserCash(Math.max(0, parseInt(e.target.value) || 0))}
                                onBlur={(e) => {
                                    if (parseInt(e.target.value) > currentUserCashInDollars) {
                                        setCurrentUserCash(Math.floor(currentUserCashInDollars));
                                        addNotification(`You only have ${formatCurrency(currentUser.balance)} available.`, 'warning');
                                    }
                                }}
                                className="w-28 pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                placeholder="0"
                                min="0"
                                max={currentUserCashInDollars}
                            />
                        </div>
                        <span className="text-xs text-slate-400">/ {formatCurrency(currentUser.balance)} available</span>
                    </div>

                    {/* Propose Button */}
                    <button
                        onClick={() => setIsModalOpen(true)}
                        disabled={isSubmitting || (currentUserItems.length === 0 && currentUserCash === 0)}
                        className="px-8 py-3 text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none disabled:shadow-md disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "Submitting..." : "Propose Trade"}
                    </button>
                </div>
            </div>

            {/* Add padding at bottom for floating bar */}
            <div className="h-24" />

            <ConfirmationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleProposeTrade}
                title="Confirm Trade Proposal"
                confirmButtonText="Yes, Propose Trade"
                confirmButtonClass="bg-blue-600 hover:bg-blue-700"
            >
                Are you sure you want to propose this trade to {otherUser.name}?
            </ConfirmationModal>

            {/* Item Detail Preview Modal */}
            <ItemDetailModal
                item={previewItem}
                isOpen={!!previewItem}
                onClose={() => setPreviewItem(null)}
                onAddToTrade={() => {
                    if (previewItem) {
                        toggleItemSelection(previewItem, previewOwner);
                    }
                }}
                isInTrade={previewItem ? (
                    previewOwner === 'current'
                        ? !!currentUserItems.find(i => i.id === previewItem.id)
                        : !!otherUserItems.find(i => i.id === previewItem.id)
                ) : false}
                actionLabel={previewOwner === 'current' ? 'Add to Your Offer' : 'Request This Item'}
            />
        </div>
    );
};

export default TradeDesk;