import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FEE_CONSTANTS } from '../types';
import { formatCurrency } from '../utils/currency';

/**
 * Pro Upgrade Page
 * Explains benefits and allows users to upgrade to Pro subscription
 */
const ProUpgradePage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { currentUser } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isProUser = currentUser?.subscriptionTier === 'PRO' && currentUser?.subscriptionStatus === 'active';

    // Check for success/cancel params
    useEffect(() => {
        if (searchParams.get('success') === 'true') {
            setMessage({ type: 'success', text: 'Welcome to Pro! Your subscription is now active. Please refresh or re-login to see your updated status.' });
        } else if (searchParams.get('canceled') === 'true') {
            setMessage({ type: 'error', text: 'Checkout was canceled. You can try again anytime.' });
        }
    }, [searchParams]);

    const handleUpgrade = async () => {
        if (!currentUser?.id) return;

        setIsLoading(true);
        setMessage(null);

        try {
            const response = await fetch('http://localhost:4000/api/subscription/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id }),
            });

            const data = await response.json();

            if (data.checkoutUrl) {
                // Redirect to Stripe Checkout
                window.location.href = data.checkoutUrl;
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to create checkout session' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Something went wrong' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-violet-950 to-slate-900">
            {/* Hero Section */}
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                {/* Success/Error Message */}
                {message && (
                    <div className={`mb-8 px-6 py-4 rounded-xl font-medium ${message.type === 'success'
                        ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                        : 'bg-red-500/20 border border-red-500/50 text-red-400'
                        }`}>
                        {message.text}
                    </div>
                )}

                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full text-slate-900 font-bold text-sm mb-8">
                    ✨ LEVERAGE PRO
                </div>

                <h1 className="text-4xl md:text-6xl font-extrabold text-white mb-6">
                    Trade <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">More</span>, Pay <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">Less</span>
                </h1>

                <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-12">
                    Upgrade to Pro and get 3 free trades every month, plus exclusive features designed for serious collectors.
                </p>

                {/* Pricing Card */}
                <div className="inline-block bg-white/10 backdrop-blur-lg rounded-3xl border border-white/20 p-8 mb-12 shadow-2xl">
                    <div className="flex items-end justify-center gap-1 mb-4">
                        <span className="text-6xl font-extrabold text-white">{formatCurrency(FEE_CONSTANTS.PRO_MONTHLY_PRICE_CENTS)}</span>
                        <span className="text-slate-400 text-lg pb-2">/month</span>
                    </div>

                    <p className="text-emerald-400 font-medium mb-6">
                        Save up to {formatCurrency(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS * 3 - FEE_CONSTANTS.PRO_MONTHLY_PRICE_CENTS)} per month
                    </p>

                    {isProUser ? (
                        <div className="px-8 py-4 bg-emerald-500/20 border border-emerald-500/50 rounded-xl text-emerald-400 font-semibold">
                            ✓ You're already a Pro member!
                        </div>
                    ) : (
                        <button
                            onClick={handleUpgrade}
                            disabled={isLoading}
                            className="w-full px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/25 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isLoading ? 'Loading...' : 'Upgrade to Pro'}
                        </button>
                    )}
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-16">
                    {/* Feature 1 */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                        <div className="w-12 h-12 bg-violet-500/20 rounded-xl flex items-center justify-center text-2xl mb-4">
                            🎟️
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">3 Free Trades/Month</h3>
                        <p className="text-slate-400">
                            Skip the {formatCurrency(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS)} escrow fee on your first 3 trades each month.
                            That's up to {formatCurrency(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS * 3)} in savings!
                        </p>
                    </div>

                    {/* Feature 2 */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-2xl mb-4">
                            📦
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">eBay Import</h3>
                        <p className="text-slate-400">
                            Instantly import your entire eBay inventory with one click.
                            Bring your existing listings to Leverage in seconds.
                        </p>
                    </div>

                    {/* Feature 3 */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-2xl mb-4">
                            📊
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Advanced Analytics</h3>
                        <p className="text-slate-400">
                            Get detailed insights into your trading performance,
                            value trends, and market opportunities.
                        </p>
                    </div>

                    {/* Feature 4 */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-2xl mb-4">
                            ⭐
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Pro Badge</h3>
                        <p className="text-slate-400">
                            Stand out with a Pro badge on your profile.
                            Build trust faster with other traders.
                        </p>
                    </div>
                </div>

                {/* Comparison */}
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-12">
                    <h2 className="text-2xl font-bold text-white mb-8">Free vs Pro</h2>
                    <div className="grid grid-cols-3 gap-4 text-left">
                        <div className="font-medium text-slate-400">Feature</div>
                        <div className="font-bold text-slate-300 text-center">Free</div>
                        <div className="font-bold text-violet-400 text-center">Pro</div>

                        <div className="text-slate-300 py-3 border-t border-white/10">Escrow Fee</div>
                        <div className="text-center py-3 border-t border-white/10">{formatCurrency(FEE_CONSTANTS.FLAT_ESCROW_FEE_CENTS)}/trade</div>
                        <div className="text-center py-3 border-t border-white/10 text-emerald-400">3 FREE/month</div>

                        <div className="text-slate-300 py-3 border-t border-white/10">eBay Import</div>
                        <div className="text-center py-3 border-t border-white/10 text-red-400">✗</div>
                        <div className="text-center py-3 border-t border-white/10 text-emerald-400">✓</div>

                        <div className="text-slate-300 py-3 border-t border-white/10">Analytics</div>
                        <div className="text-center py-3 border-t border-white/10">Basic</div>
                        <div className="text-center py-3 border-t border-white/10 text-violet-400">Advanced</div>

                        <div className="text-slate-300 py-3 border-t border-white/10">Pro Badge</div>
                        <div className="text-center py-3 border-t border-white/10 text-red-400">✗</div>
                        <div className="text-center py-3 border-t border-white/10 text-emerald-400">✓</div>
                    </div>
                </div>

                {/* Back Button */}
                <button
                    onClick={() => navigate('/')}
                    className="text-slate-400 hover:text-white transition-colors"
                >
                    ← Back to Dashboard
                </button>
            </div>
        </div>
    );
};

export default ProUpgradePage;
