import React, { useState } from 'react';
import './ShippingRateSelector.css';

export interface ShippingRate {
    rateId: string;
    carrier: string;
    servicelevel: {
        name: string;
        token: string;
    };
    amount: string;
    currency: string;
    estimatedDays: number | null;
    durationTerms: string | null;
}

interface ShippingRateSelectorProps {
    rates: ShippingRate[];
    selectedRateId?: string;
    onSelect: (rate: ShippingRate) => void;
    onPurchase?: (rate: ShippingRate) => void;
    isPurchasing?: boolean;
}

// Carrier logo mapping
const CARRIER_LOGOS: Record<string, string> = {
    'USPS': '📫',
    'UPS': '📦',
    'FedEx': '✈️',
    'DHL': '🚀',
    'usps': '📫',
    'ups': '📦',
    'fedex': '✈️',
    'dhl_express': '🚀',
};

const CARRIER_COLORS: Record<string, string> = {
    'USPS': '#004B87',
    'UPS': '#351C15',
    'FedEx': '#4D148C',
    'DHL': '#FFCC00',
    'usps': '#004B87',
    'ups': '#351C15',
    'fedex': '#4D148C',
    'dhl_express': '#FFCC00',
};

export const ShippingRateSelector: React.FC<ShippingRateSelectorProps> = ({
    rates,
    selectedRateId,
    onSelect,
    onPurchase,
    isPurchasing = false
}) => {
    const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(
        rates.find(r => r.rateId === selectedRateId) || null
    );

    const handleSelect = (rate: ShippingRate) => {
        setSelectedRate(rate);
        onSelect(rate);
    };

    const handlePurchase = () => {
        if (selectedRate && onPurchase) {
            onPurchase(selectedRate);
        }
    };

    // Sort rates by price (cheapest first)
    const sortedRates = [...rates].sort((a, b) =>
        parseFloat(a.amount) - parseFloat(b.amount)
    );

    const cheapestRate = sortedRates[0];
    const fastestRate = rates.reduce((fastest, rate) => {
        if (!rate.estimatedDays) return fastest;
        if (!fastest || !fastest.estimatedDays) return rate;
        return rate.estimatedDays < fastest.estimatedDays ? rate : fastest;
    }, null as ShippingRate | null);

    return (
        <div className="shipping-rate-selector">
            <div className="rates-header">
                <h3>Select Shipping Method</h3>
                <span className="rates-count">{rates.length} options available</span>
            </div>

            <div className="rates-list">
                {sortedRates.map((rate) => {
                    const isSelected = selectedRate?.rateId === rate.rateId;
                    const isCheapest = rate.rateId === cheapestRate?.rateId;
                    const isFastest = rate.rateId === fastestRate?.rateId && fastestRate?.rateId !== cheapestRate?.rateId;
                    const carrierLogo = CARRIER_LOGOS[rate.carrier] || '📦';
                    const carrierColor = CARRIER_COLORS[rate.carrier] || '#6366f1';

                    return (
                        <div
                            key={rate.rateId}
                            className={`rate-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSelect(rate)}
                        >
                            <div className="rate-carrier">
                                <span className="carrier-logo">{carrierLogo}</span>
                                <div className="carrier-info">
                                    <span
                                        className="carrier-name"
                                        style={{ color: carrierColor }}
                                    >
                                        {rate.carrier}
                                    </span>
                                    <span className="service-level">{rate.servicelevel.name}</span>
                                </div>
                            </div>

                            <div className="rate-details">
                                {rate.estimatedDays && (
                                    <span className="delivery-time">
                                        {rate.estimatedDays === 1
                                            ? 'Next day'
                                            : `${rate.estimatedDays} days`}
                                    </span>
                                )}
                                {rate.durationTerms && (
                                    <span className="duration-terms">{rate.durationTerms}</span>
                                )}
                            </div>

                            <div className="rate-price-section">
                                <span className="rate-price">
                                    ${parseFloat(rate.amount).toFixed(2)}
                                </span>
                                <div className="rate-badges">
                                    {isCheapest && <span className="badge cheapest">Best Value</span>}
                                    {isFastest && <span className="badge fastest">Fastest</span>}
                                </div>
                            </div>

                            <div className="rate-radio">
                                <div className={`radio-circle ${isSelected ? 'checked' : ''}`}>
                                    {isSelected && <div className="radio-dot" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedRate && onPurchase && (
                <div className="purchase-section">
                    <div className="purchase-summary">
                        <span>Selected: {selectedRate.carrier} {selectedRate.servicelevel.name}</span>
                        <span className="purchase-total">${parseFloat(selectedRate.amount).toFixed(2)}</span>
                    </div>
                    <button
                        className="btn-purchase"
                        onClick={handlePurchase}
                        disabled={isPurchasing}
                    >
                        {isPurchasing ? 'Purchasing...' : '🏷️ Buy Shipping Label'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ShippingRateSelector;
