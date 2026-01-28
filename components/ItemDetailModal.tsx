import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Item } from '../types.ts';
import { formatCurrency, formatCurrencyOptional } from '../utils/currency.ts';
import ValuationBadge from './ValuationBadge.tsx';
import PSALinkModal from './PSALinkModal.tsx';
import { createItemInquiry } from '../api/api';
import { useAuth } from '../context/AuthContext';

interface ItemDetailModalProps {
    item: Item | null;
    isOpen: boolean;
    onClose: () => void;
    onAddToTrade?: () => void;
    isInTrade?: boolean;
    actionLabel?: string;
    onItemUpdated?: () => void;
}

// TCG category ID from the database
const TCG_CATEGORY_ID = 2;

const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
    item,
    isOpen,
    onClose,
    onAddToTrade,
    isInTrade = false,
    actionLabel = 'Add to Trade',
    onItemUpdated
}) => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [showPSAModal, setShowPSAModal] = useState(false);
    const [psaData, setPsaData] = useState<any>(null);
    const [isAskingQuestion, setIsAskingQuestion] = useState(false);

    if (!isOpen || !item) return null;

    // Check if current user owns this item
    const isOwnItem = currentUser && String(currentUser.id) === String(item.ownerId);

    const handleAskQuestion = async () => {
        if (!currentUser || isOwnItem) return;
        setIsAskingQuestion(true);
        try {
            const conversation = await createItemInquiry(item.id, currentUser.id);
            onClose();
            navigate(`/messages?conversation=${conversation.id}`);
        } catch (err) {
            console.error('Failed to create inquiry:', err);
        } finally {
            setIsAskingQuestion(false);
        }
    };

    const imageUrl = item.imageUrl && item.imageUrl.startsWith('/')
        ? `http://localhost:4000${item.imageUrl}`
        : item.imageUrl;

    const emvSource = (item as any).emv_source || (item as any).emvSource || item.valuationSource;

    // Check if this is a TCG item (eligible for PSA linking)
    const categoryId = (item as any).category_id || (item as any).categoryId;
    const isTCGItem = categoryId === TCG_CATEGORY_ID;

    // Check if item already has PSA data
    const existingPsaGrade = (item as any).psa_grade || (item as any).psaGrade;
    const existingPsaCert = (item as any).psa_cert_number || (item as any).psaCertNumber;

    const handlePSALinked = (certNumber: string, certData: any) => {
        setPsaData(certData);
        if (onItemUpdated) {
            onItemUpdated();
        }
    };

    return (
        <>
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

                    {/* PSA Badge (if graded) */}
                    {(existingPsaGrade || psaData) && (
                        <div className="absolute top-4 left-4 z-10">
                            <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
                                <span className="text-xs font-medium">PSA</span>
                                <span className="text-lg font-bold">{psaData?.grade || existingPsaGrade}</span>
                            </div>
                        </div>
                    )}

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
                                <ValuationBadge
                                    source={emvSource}
                                    condition={item.condition}
                                    lastUpdated={(item as any).emv_updated_at}
                                    itemName={item.name}
                                    size="sm"
                                />
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

                            {/* PSA Info (if linked) */}
                            {(existingPsaGrade || psaData) && (
                                <div className="bg-red-50 rounded-lg p-3 col-span-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="text-xs text-red-600">✓ PSA Certified</span>
                                            <p className="text-xs text-red-700 mt-0.5">
                                                Cert #{existingPsaCert || psaData?.certNumber}
                                                {psaData?.population && ` • Pop ${psaData.population.toLocaleString()}`}
                                            </p>
                                        </div>
                                        <div className="text-red-600 font-bold">
                                            {psaData?.gradeDescription || 'Graded'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Link PSA Button (for TCG items without PSA) */}
                            {isTCGItem && !existingPsaGrade && !psaData && (
                                <button
                                    onClick={() => setShowPSAModal(true)}
                                    className="col-span-2 bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-3 text-left hover:from-red-100 hover:to-orange-100 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">🏆</span>
                                        <div>
                                            <span className="text-sm font-medium text-red-700">Link PSA Certification</span>
                                            <p className="text-xs text-red-600 mt-0.5">Verify your graded card</p>
                                        </div>
                                    </div>
                                </button>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-2">
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

                            {/* Ask Question button (only for items not owned by current user) */}
                            {!isOwnItem && currentUser && (
                                <button
                                    onClick={handleAskQuestion}
                                    disabled={isAskingQuestion}
                                    className="w-full py-3 px-4 rounded-xl font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                                >
                                    {isAskingQuestion ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                                            Opening...
                                        </>
                                    ) : (
                                        <>
                                            💬 Ask Question
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* PSA Link Modal */}
            <PSALinkModal
                isOpen={showPSAModal}
                onClose={() => setShowPSAModal(false)}
                onLink={handlePSALinked}
                itemId={parseInt(String(item.id), 10)}
                itemName={item.name}
            />
        </>
    );
};

export default ItemDetailModal;

