import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { fetchUser, proposeTrade } from '../api/api';
import { User, Item } from '../types.ts';
import ItemCard from './ItemCard.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import ItemDetailModal from './ItemDetailModal.tsx';
import { formatCurrency, dollarsToCents } from '../utils/currency.ts';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    useDraggable,
    useDroppable,
    PointerSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core';

const TradeDesk: React.FC = () => {
    const { currentUser, updateUser } = useAuth();
    const navigate = useNavigate();
    const { otherUserId } = useParams<{ otherUserId: string }>();
    const [searchParams] = useSearchParams();
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

    // Drag and drop state
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeDragData, setActiveDragData] = useState<{ item: Item; owner: 'current' | 'other'; isRemoving?: boolean } | null>(null);

    // Configure sensors - require 8px movement before starting drag (prevents accidental drags)
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    // Drag event handlers
    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveId(active.id as string);
        setActiveDragData(active.data.current as { item: Item; owner: 'current' | 'other'; isRemoving?: boolean });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && activeDragData) {
            const dropZoneId = over.id as string;
            const { item, owner, isRemoving } = activeDragData;

            if (isRemoving) {
                // Dragging a selected item - dropping on collection zone OR offer zone removes it
                // (dropping anywhere in the user's own area should work)
                const isValidRemove =
                    (dropZoneId === 'yours-collection' && owner === 'current') ||
                    (dropZoneId === 'yours-drop' && owner === 'current') ||
                    (dropZoneId === 'theirs-collection' && owner === 'other') ||
                    (dropZoneId === 'theirs-drop' && owner === 'other');

                if (isValidRemove) {
                    toggleItemSelection(item, owner); // Remove from offer
                }
            } else {
                // Dragging an unselected item - dropping on offer zone adds it
                const isValidAdd =
                    (dropZoneId === 'yours-drop' && owner === 'current') ||
                    (dropZoneId === 'theirs-drop' && owner === 'other');

                if (isValidAdd) {
                    toggleItemSelection(item, owner); // Add to offer
                }
            }
        }

        setActiveId(null);
        setActiveDragData(null);
    };

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

    // Pre-populate trade from URL params (e.g., from wishlist match)
    useEffect(() => {
        if (!currentUser || !otherUser) return;

        const offerParam = searchParams.get('offer');
        const requestParam = searchParams.get('request');

        if (offerParam) {
            const offerIds = offerParam.split(',').map(id => String(id));
            const itemsToOffer = currentUser.inventory.filter(item => offerIds.includes(String(item.id)));
            if (itemsToOffer.length > 0) {
                setCurrentUserItems(itemsToOffer);
            }
        }

        if (requestParam) {
            const requestIds = requestParam.split(',').map(id => String(id));
            const itemsToRequest = otherUser.inventory.filter(item => requestIds.includes(String(item.id)));
            if (itemsToRequest.length > 0) {
                setOtherUserItems(itemsToRequest);
            }
        }
    }, [currentUser, otherUser, searchParams]);

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

    // Draggable Offer Item - items in the offer zone that can be dragged back to collection
    const DraggableOfferItem = ({ item, owner, onRemove }: { item: Item; owner: 'current' | 'other'; onRemove: () => void }) => {
        const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
            id: `offer-item-${item.id}-${owner}`,
            data: { item, owner, isRemoving: true }, // Always removing since it's already in the offer
        });

        const style = transform ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        } : undefined;

        return (
            <div
                ref={setNodeRef}
                style={style}
                {...listeners}
                {...attributes}
                className={`flex items-center gap-2 bg-white rounded-lg px-3 py-2 shadow-sm border transition-all cursor-grab ${isDragging
                    ? 'opacity-50 scale-95 border-red-400 cursor-grabbing shadow-lg z-50'
                    : 'border-slate-200 hover:border-red-300 hover:bg-red-50'
                    }`}
                onClick={(e) => {
                    if (!isDragging) {
                        onRemove();
                    }
                }}
                title="Drag to collection or click to remove"
            >
                <img
                    src={getItemImageUrl(item)}
                    alt={item.name}
                    className="w-8 h-8 rounded object-cover pointer-events-none"
                    draggable={false}
                />
                <div className="pointer-events-none">
                    <p className="text-sm font-medium text-slate-700 truncate max-w-[100px]">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(item.estimatedMarketValue || 0)}</p>
                </div>
                <span className="text-red-400 text-xs ml-1 pointer-events-none">✕</span>
            </div>
        );
    };

    // Offer Zone Component - droppable zone for items
    const OfferZone = ({ title, items, isYours, dropId }: { title: string; items: Item[]; isYours: boolean; dropId: string }) => {
        const { isOver, setNodeRef } = useDroppable({
            id: dropId,
        });

        // Check if the item being dragged can be dropped here
        const canReceive = activeDragData && (
            (isYours && activeDragData.owner === 'current') ||
            (!isYours && activeDragData.owner === 'other')
        );

        const isValidDropTarget = isOver && canReceive;

        return (
            <div
                ref={setNodeRef}
                className={`flex-1 rounded-2xl border-2 border-dashed p-4 min-h-[180px] transition-all ${isValidDropTarget
                    ? isYours ? 'border-orange-500 bg-orange-100 scale-[1.02] shadow-lg' : 'border-green-500 bg-green-100 scale-[1.02] shadow-lg'
                    : items.length > 0
                        ? isYours ? 'border-orange-300 bg-orange-50' : 'border-green-300 bg-green-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
            >
                <h3 className={`text-sm font-semibold mb-3 ${isYours ? 'text-orange-700' : 'text-green-700'
                    }`}>{title}</h3>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[120px] text-slate-400">
                        <div className={`w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center mb-2 transition-all ${isValidDropTarget ? 'border-current scale-110' : 'border-slate-300'
                            }`}>
                            <span className={`text-2xl ${isValidDropTarget ? 'text-current' : 'text-slate-300'}`}>
                                {isValidDropTarget ? '↓' : '+'}
                            </span>
                        </div>
                        <p className="text-xs text-center">
                            {isValidDropTarget ? 'Drop here!' : 'Drag or click items below to add'}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {items.map(item => (
                            <DraggableOfferItem
                                key={item.id}
                                item={item}
                                owner={isYours ? 'current' : 'other'}
                                onRemove={() => toggleItemSelection(item, isYours ? 'current' : 'other')}
                            />
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

    // Custom Trade Item Card with preview, quick-add, and drag support
    const TradeItemCard = ({
        item,
        isSelected,
        onPreview,
        onToggle,
        accentColor,
        owner
    }: {
        item: Item;
        isSelected: boolean;
        onPreview: () => void;
        onToggle: () => void;
        accentColor: 'orange' | 'green';
        owner: 'current' | 'other';
    }) => {
        const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
            id: `item-${item.id}-${owner}`,
            data: { item, owner, isRemoving: false }, // Collection cards are for adding only
            disabled: isSelected, // Disable dragging when already in offer - use offer zone cards instead
        });

        const imageUrl = item.imageUrl && item.imageUrl.startsWith('/')
            ? `http://localhost:4000${item.imageUrl}`
            : item.imageUrl;

        const style = transform ? {
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        } : undefined;

        return (
            <div
                ref={setNodeRef}
                style={style}
                {...listeners}
                {...attributes}
                className={`relative group bg-white rounded-xl border-2 transition-all duration-200 overflow-hidden ${isDragging
                    ? 'opacity-50 scale-95 z-50 shadow-2xl cursor-grabbing'
                    : isSelected
                        ? 'opacity-50 grayscale border-slate-300 cursor-pointer' // Grayed out when in offer, click to remove
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md cursor-grab'
                    }`}
                onClick={(e) => {
                    // Only trigger preview if not dragging
                    if (!isDragging) {
                        if (isSelected) {
                            // For selected items, click to remove from offer
                            onToggle();
                        } else {
                            // For unselected items, click to preview
                            onPreview();
                        }
                    }
                }}
            >
                {/* Image - larger and more prominent */}
                <div className="aspect-square bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden pointer-events-none">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            draggable={false}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl text-slate-300">📦</div>
                    )}
                </div>

                {/* Info */}
                <div className="p-3 pointer-events-none">
                    <h4 className={`font-semibold text-sm line-clamp-2 leading-tight mb-1 ${isSelected ? 'text-slate-500' : 'text-slate-800'}`}>{item.name}</h4>
                    <p className={`text-sm font-medium ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>{formatCurrency(item.estimatedMarketValue || 0)}</p>
                </div>

                {/* Quick-add button - visible on hover, always visible if selected */}
                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className={`absolute bottom-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg transition-all pointer-events-auto ${isSelected
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
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {isDragging ? 'Dragging...' : isSelected ? 'Click to remove' : 'Drag or click'}
                </div>
            </div>
        );
    };

    // Collection Grid Component - droppable zone for returning items from offer
    const CollectionGrid = ({
        title,
        user,
        selectedItems,
        onSelect,
        onPreview,
        isYours,
        dropId
    }: {
        title: string;
        user: User;
        selectedItems: Item[];
        onSelect: (item: Item) => void;
        onPreview: (item: Item) => void;
        isYours: boolean;
        dropId: string;
    }) => {
        const { isOver, setNodeRef } = useDroppable({
            id: dropId,
        });

        // Can receive items being removed (dragged from offer back to collection)
        const canReceive = activeDragData?.isRemoving && (
            (isYours && activeDragData.owner === 'current') ||
            (!isYours && activeDragData.owner === 'other')
        );

        const isValidDropTarget = isOver && canReceive;

        return (
            <div
                ref={setNodeRef}
                className={`bg-white rounded-2xl shadow-sm border p-5 transition-all ${isValidDropTarget
                    ? isYours
                        ? 'ring-2 ring-orange-400 bg-orange-50 border-orange-300'
                        : 'ring-2 ring-green-400 bg-green-50 border-green-300'
                    : 'border-slate-200'
                    }`}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-base font-semibold ${isYours ? 'text-orange-700' : 'text-green-700'}`}>
                        {title}
                        {isValidDropTarget && <span className="ml-2 text-xs font-normal">← Drop to remove</span>}
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
                                owner={isYours ? 'current' : 'other'}
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
    };

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!otherUser) return <div className="p-8 text-center text-red-500">Could not load trade partner.</div>;

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
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
                            <OfferZone title="You're Offering" items={currentUserItems} isYours={true} dropId="yours-drop" />

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
                            <OfferZone title={`${otherUser.name}'s Offer`} items={otherUserItems} isYours={false} dropId="theirs-drop" />
                        </div>
                    </div>

                    {/* Collections - Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <CollectionGrid
                            title="Your Collection"
                            user={currentUser}
                            selectedItems={currentUserItems}
                            onSelect={(item) => toggleItemSelection(item, 'current')}
                            onPreview={(item) => { setPreviewItem(item); setPreviewOwner('current'); }}
                            isYours={true}
                            dropId="yours-collection"
                        />
                        <CollectionGrid
                            title={`${otherUser.name}'s Collection`}
                            user={otherUser}
                            selectedItems={otherUserItems}
                            onSelect={(item) => toggleItemSelection(item, 'other')}
                            onPreview={(item) => { setPreviewItem(item); setPreviewOwner('other'); }}
                            isYours={false}
                            dropId="theirs-collection"
                        />
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
                    confirmButtonText="Send Proposal"
                    confirmButtonClass="bg-blue-600 hover:bg-blue-700"
                >
                    <div className="space-y-4">
                        {/* Trade Summary */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Your Offer */}
                            <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                                <h4 className="text-sm font-semibold text-orange-700 mb-2">You're Offering</h4>
                                {currentUserItems.length > 0 ? (
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                        {currentUserItems.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 text-xs">
                                                <div className="w-6 h-6 rounded bg-slate-200 overflow-hidden flex-shrink-0">
                                                    {item.imageUrl && (
                                                        <img
                                                            src={item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                                <span className="truncate flex-1 text-slate-700">{item.name}</span>
                                                <span className="text-slate-500">{formatCurrency(item.estimatedMarketValue || 0)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400">No items</p>
                                )}
                                {currentUserCash > 0 && (
                                    <div className="mt-2 pt-2 border-t border-orange-200 flex items-center justify-between text-xs">
                                        <span className="text-green-600 font-medium">+ Cash</span>
                                        <span className="text-green-600 font-medium">{formatCurrency(dollarsToCents(currentUserCash))}</span>
                                    </div>
                                )}
                                <div className="mt-2 pt-2 border-t border-orange-200 flex items-center justify-between text-sm font-semibold">
                                    <span className="text-orange-700">Total</span>
                                    <span className="text-orange-700">{formatCurrency(yourOfferValue)}</span>
                                </div>
                            </div>

                            {/* Their Request */}
                            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                <h4 className="text-sm font-semibold text-green-700 mb-2">You're Requesting</h4>
                                {otherUserItems.length > 0 ? (
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                        {otherUserItems.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 text-xs">
                                                <div className="w-6 h-6 rounded bg-slate-200 overflow-hidden flex-shrink-0">
                                                    {item.imageUrl && (
                                                        <img
                                                            src={item.imageUrl.startsWith('/') ? `http://localhost:4000${item.imageUrl}` : item.imageUrl}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                        />
                                                    )}
                                                </div>
                                                <span className="truncate flex-1 text-slate-700">{item.name}</span>
                                                <span className="text-slate-500">{formatCurrency(item.estimatedMarketValue || 0)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400">No items</p>
                                )}
                                <div className="mt-2 pt-2 border-t border-green-200 flex items-center justify-between text-sm font-semibold">
                                    <span className="text-green-700">Total</span>
                                    <span className="text-green-700">{formatCurrency(theirOfferValue)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Value Difference */}
                        {valueDifference !== 0 && (
                            <div className={`text-center py-2 px-3 rounded-lg text-sm ${valueDifference > 0
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-green-100 text-green-700'
                                }`}>
                                {valueDifference > 0
                                    ? `⚠️ You're offering ${formatCurrency(Math.abs(valueDifference))} more in value`
                                    : `✓ You're receiving ${formatCurrency(Math.abs(valueDifference))} more in value`
                                }
                            </div>
                        )}

                        <p className="text-xs text-center text-slate-500">
                            This proposal will be sent to <strong>{otherUser.name}</strong> for review
                        </p>
                    </div>
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

            {/* Drag Overlay - shows a preview of the item being dragged */}
            <DragOverlay>
                {activeDragData ? (
                    <div className="w-32 h-40 bg-white rounded-xl border-2 border-blue-400 shadow-2xl overflow-hidden opacity-90 rotate-3">
                        <div className="aspect-square bg-slate-100">
                            {activeDragData.item.imageUrl && (
                                <img
                                    src={activeDragData.item.imageUrl.startsWith('/')
                                        ? `http://localhost:4000${activeDragData.item.imageUrl}`
                                        : activeDragData.item.imageUrl}
                                    alt={activeDragData.item.name}
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                        <div className="p-2">
                            <p className="text-xs font-semibold text-slate-800 truncate">{activeDragData.item.name}</p>
                        </div>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};

export default TradeDesk;