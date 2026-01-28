import React, { useState, useEffect } from 'react';
import AddressForm, { Address } from './AddressForm';
import ShippingRateSelector, { ShippingRate } from './ShippingRateSelector';
import './ShippingLabelModal.css';

interface ShippingLabelModalProps {
    isOpen: boolean;
    onClose: () => void;
    tradeId: string;
    userId: number;
    recipientName: string;
    itemCategory?: string;
    onLabelPurchased?: (label: {
        trackingNumber: string;
        labelUrl: string;
        carrier: string;
    }) => void;
}

type Step = 'address' | 'rates' | 'success';

export const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({
    isOpen,
    onClose,
    tradeId,
    userId,
    recipientName,
    itemCategory = 'OTHER',
    onLabelPurchased
}) => {
    const [step, setStep] = useState<Step>('address');
    const [fromAddress, setFromAddress] = useState<Address | null>(null);
    const [toAddress, setToAddress] = useState<Address | null>(null);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [rates, setRates] = useState<ShippingRate[]>([]);
    const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchasedLabel, setPurchasedLabel] = useState<{
        trackingNumber: string;
        labelUrl: string;
        carrier: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingAddress, setEditingAddress] = useState<'from' | 'to' | null>(null);

    // Load saved addresses on mount
    useEffect(() => {
        if (isOpen && userId) {
            fetchAddresses();
        }
    }, [isOpen, userId]);

    const fetchAddresses = async () => {
        try {
            const response = await fetch(`/api/users/${userId}/addresses`);
            const data = await response.json();
            setAddresses(data);

            // Auto-select default address as "from"
            const defaultAddr = data.find((a: Address) => a.is_default);
            if (defaultAddr) {
                setFromAddress(defaultAddr);
            }
        } catch (err) {
            console.error('Failed to load addresses:', err);
        }
    };

    const handleAddressSaved = (address: Address) => {
        if (editingAddress === 'from') {
            setFromAddress(address);
        } else {
            setToAddress(address);
        }
        setEditingAddress(null);
        fetchAddresses();
    };

    const handleGetRates = async () => {
        if (!fromAddress || !toAddress) {
            setError('Please provide both shipping addresses');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/shipping/rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromAddress,
                    toAddress,
                    itemCategory
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to get rates');
            }

            const data = await response.json();
            setRates(data.rates);
            setStep('rates');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePurchase = async (rate: ShippingRate) => {
        setIsPurchasing(true);
        setError(null);

        try {
            const response = await fetch('/api/shipping/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rateId: rate.rateId,
                    tradeId,
                    userId,
                    carrier: rate.carrier,
                    servicelevel: rate.servicelevel.name,
                    amountCents: Math.round(parseFloat(rate.amount) * 100)
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to purchase label');
            }

            const result = await response.json();

            const label = {
                trackingNumber: result.trackingNumber,
                labelUrl: result.labelUrl,
                carrier: result.carrier || rate.carrier
            };

            setPurchasedLabel(label);
            setStep('success');

            if (onLabelPurchased) {
                onLabelPurchased(label);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsPurchasing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="shipping-modal-overlay" onClick={onClose}>
            <div className="shipping-modal" onClick={e => e.stopPropagation()}>
                <div className="shipping-modal-header">
                    <h2>
                        {step === 'address' && '📦 Ship Your Items'}
                        {step === 'rates' && '🚚 Select Shipping Method'}
                        {step === 'success' && '✅ Label Purchased!'}
                    </h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="shipping-modal-content">
                    {step === 'address' && (
                        <>
                            {/* From Address */}
                            <div className="address-section">
                                <h3>From (Your Address)</h3>
                                {editingAddress === 'from' ? (
                                    <AddressForm
                                        userId={userId}
                                        initialAddress={fromAddress}
                                        onSave={handleAddressSaved}
                                        onCancel={() => setEditingAddress(null)}
                                    />
                                ) : fromAddress ? (
                                    <div className="address-display">
                                        <p>{fromAddress.name}</p>
                                        <p>{fromAddress.street1} {fromAddress.street2}</p>
                                        <p>{fromAddress.city}, {fromAddress.state} {fromAddress.zip}</p>
                                        <button
                                            className="btn-change"
                                            onClick={() => setEditingAddress('from')}
                                        >
                                            Change
                                        </button>
                                    </div>
                                ) : (
                                    <div className="address-empty">
                                        <p>No address selected</p>
                                        <button
                                            className="btn-add"
                                            onClick={() => setEditingAddress('from')}
                                        >
                                            + Add Address
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* To Address */}
                            <div className="address-section">
                                <h3>To ({recipientName})</h3>
                                {editingAddress === 'to' ? (
                                    <AddressForm
                                        userId={userId}
                                        initialAddress={toAddress}
                                        onSave={handleAddressSaved}
                                        onCancel={() => setEditingAddress(null)}
                                    />
                                ) : toAddress ? (
                                    <div className="address-display">
                                        <p>{toAddress.name}</p>
                                        <p>{toAddress.street1} {toAddress.street2}</p>
                                        <p>{toAddress.city}, {toAddress.state} {toAddress.zip}</p>
                                        <button
                                            className="btn-change"
                                            onClick={() => setEditingAddress('to')}
                                        >
                                            Change
                                        </button>
                                    </div>
                                ) : (
                                    <div className="address-empty">
                                        <p>Enter recipient's shipping address</p>
                                        <button
                                            className="btn-add"
                                            onClick={() => setEditingAddress('to')}
                                        >
                                            + Add Recipient Address
                                        </button>
                                    </div>
                                )}
                            </div>

                            {error && <div className="error-message">⚠️ {error}</div>}

                            <button
                                className="btn-continue"
                                onClick={handleGetRates}
                                disabled={!fromAddress || !toAddress || isLoading}
                            >
                                {isLoading ? 'Getting Rates...' : 'Get Shipping Rates →'}
                            </button>
                        </>
                    )}

                    {step === 'rates' && (
                        <>
                            <button
                                className="btn-back"
                                onClick={() => setStep('address')}
                            >
                                ← Back to Addresses
                            </button>

                            <ShippingRateSelector
                                rates={rates}
                                onSelect={setSelectedRate}
                                onPurchase={handlePurchase}
                                isPurchasing={isPurchasing}
                            />

                            {error && <div className="error-message">⚠️ {error}</div>}
                        </>
                    )}

                    {step === 'success' && purchasedLabel && (
                        <div className="success-content">
                            <div className="success-icon">🎉</div>
                            <h3>Shipping Label Created!</h3>

                            <div className="label-info">
                                <p><strong>Tracking Number:</strong></p>
                                <code className="tracking-number">{purchasedLabel.trackingNumber}</code>
                                <p><strong>Carrier:</strong> {purchasedLabel.carrier}</p>
                            </div>

                            <a
                                href={purchasedLabel.labelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-download"
                            >
                                📄 Download Label (PDF)
                            </a>

                            <p className="success-note">
                                Print this label and attach it to your package.
                                Drop it off at your nearest {purchasedLabel.carrier} location.
                            </p>

                            <button className="btn-done" onClick={onClose}>
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShippingLabelModal;
