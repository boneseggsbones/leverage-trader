import React from 'react';
import { formatCurrency } from '../utils/currency';
import { FEE_CONSTANTS } from '../types';

interface FeeBreakdownProps {
    platformFeeCents: number;
    isFeeWaived: boolean;
    feeReason?: string;
    remainingFreeTrades?: number;
    onUpgrade?: () => void;
}

/**
 * Component to display platform fee breakdown and Pro upsell
 */
const FeeBreakdown: React.FC<FeeBreakdownProps> = ({
    platformFeeCents,
    isFeeWaived,
    feeReason,
    remainingFreeTrades,
    onUpgrade
}) => {
    const feeAmount = formatCurrency(platformFeeCents);
    const proPrice = formatCurrency(FEE_CONSTANTS.PRO_MONTHLY_PRICE_CENTS);

    if (isFeeWaived) {
        // Pro user with free trade
        return (
            <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg p-4 border border-violet-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">✨</span>
                        <div>
                            <p className="text-sm font-semibold text-violet-700">Pro Trade - No Fee!</p>
                            <p className="text-xs text-violet-600">
                                {remainingFreeTrades !== undefined
                                    ? remainingFreeTrades > 0
                                        ? `${remainingFreeTrades} free trade${remainingFreeTrades !== 1 ? 's' : ''} remaining this month`
                                        : 'Last free trade this month!'
                                    : feeReason || 'Free trade with Pro membership'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-lg font-bold text-violet-700 line-through opacity-50">$15.00</span>
                        <span className="text-lg font-bold text-green-600 ml-2">$0.00</span>
                    </div>
                </div>
            </div>
        );
    }

    // Standard fee - show with upsell option
    return (
        <div className="space-y-3">
            {/* Fee Line */}
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🔒</span>
                        <div>
                            <p className="text-sm font-semibold text-amber-700">Escrow Protection Fee</p>
                            <p className="text-xs text-amber-600">
                                {feeReason || 'Secure your trade with escrow protection'}
                            </p>
                        </div>
                    </div>
                    <span className="text-lg font-bold text-amber-700">{feeAmount}</span>
                </div>
            </div>

            {/* Pro Upsell */}
            {onUpgrade && (
                <div className="bg-gradient-to-r from-indigo-500 to-violet-600 rounded-lg p-4 text-white relative overflow-hidden">
                    {/* Background sparkles */}
                    <div className="absolute top-1 right-3 text-white/30 text-2xl">✨</div>
                    <div className="absolute bottom-1 left-10 text-white/20 text-xl">⭐</div>

                    <div className="flex items-center justify-between relative z-10">
                        <div>
                            <p className="text-sm font-bold flex items-center gap-1">
                                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">PRO</span>
                                Skip the fee!
                            </p>
                            <p className="text-xs text-white/80 mt-1">
                                Get 3 free trades/month for just {proPrice}
                            </p>
                        </div>
                        <button
                            onClick={onUpgrade}
                            className="px-4 py-2 bg-white text-violet-600 rounded-lg text-sm font-bold shadow-lg hover:bg-violet-50 transition-all transform hover:scale-105"
                        >
                            Go Pro
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FeeBreakdown;
