
import React from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';

// --- SVG Illustrations ---

const TradeUpJourneyIcon = () => (
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <g fill="none" stroke="#64748b" strokeWidth="2">
            <rect x="5" y="20" width="20" height="20" rx="2" fill="#f1f5f9" />
            <path d="M28 30 H 45" strokeDasharray="2 2" />
            <path d="M42 27 L 45 30 L 42 33" strokeLinecap="round" strokeLinejoin="round" />
            
            <circle cx="55" cy="30" r="10" fill="#e0f2fe" stroke="#0ea5e9" />
            <path d="M52 27 l6 6 m0 -6 l-6 6" stroke="#0ea5e9" strokeLinecap="round" />

            <path d="M68 30 H 85" strokeDasharray="2 2" />
            <path d="M82 27 L 85 30 L 82 33" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="90" y="10" width="30" height="40" rx="2" fill="#f0fdf4" stroke="#22c55e"/>
        </g>
        <text x="15" y="50" fontSize="8" fill="#64748b" textAnchor="middle">Asset</text>
        <text x="55" y="50" fontSize="8" fill="#0ea5e9" textAnchor="middle">Trade</text>
        <text x="105" y="50" fontSize="8" fill="#22c55e" textAnchor="middle">Upgraded Asset</text>
    </svg>
);

const FairTradeIcon = () => (
     <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <path d="M10 50 H 90 M 50 10 V 50" stroke="#94a3b8" strokeWidth="2" />
        <path d="M15 15 H 85" stroke="#94a3b8" strokeWidth="2" />
        <path d="M15 15 L 25 50 M 85 15 L 75 50" stroke="#94a3b8" strokeWidth="2" />
        <rect x="15" y="5" width="20" height="10" rx="2" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
        <rect x="65" y="5" width="20" height="10" rx="2" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
        <g transform="translate(42 25)">
            <circle cx="8" cy="8" r="8" fill="#16a34a" />
            <text x="8" y="9" fontSize="8" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">+1</text>
        </g>
    </svg>
);

const InflatedTradeIcon = () => (
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <path d="M10 50 H 90 M 50 10 V 50" stroke="#94a3b8" strokeWidth="2" />
        <g transform="rotate(-15 50 10)">
            <path d="M15 10 H 85" stroke="#94a3b8" strokeWidth="2" />
            <path d="M15 10 L 25 50 M 85 10 L 75 50" stroke="#94a3b8" strokeWidth="2" />
            <rect x="8" y="0" width="24" height="10" rx="2" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
            <rect x="68" y="0" width="16" height="10" rx="2" fill="#f1f5f9" stroke="#64748b" strokeWidth="1.5" />
        </g>
         <g transform="translate(42 25)">
            <circle cx="8" cy="8" r="8" fill="#dc2626" />
            <text x="8" y="9" fontSize="7" fill="white" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">-10</text>
        </g>
    </svg>
);


const AboutPage: React.FC = () => {
    const { navigateTo } = useNavigation();
    const { currentUser } = useAuth();

    const handleBackClick = () => {
        // If logged in, go to dashboard. Otherwise, the router will redirect to login.
        navigateTo('dashboard');
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="text-4xl font-bold text-gray-800">About Leverage</h1>
                        <button
                            onClick={handleBackClick}
                            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                        >
                            {currentUser ? 'Back to Dashboard' : 'Back to Login'}
                        </button>
                    </div>

                    <div className="prose prose-lg max-w-none text-gray-700 bg-white p-8 rounded-lg border border-gray-200 shadow-sm">
                        <p className="lead text-xl">
                            Welcome to Leverage, a marketplace designed not just for buying and selling, but for strategic progression. We believe the items you own are more than just clutter; they're assets you can leverage to upgrade your collection.
                        </p>

                        <h2 className="text-2xl font-bold mt-12 mb-4 text-gray-800">The Philosophy: Your Trade-Up Journey</h2>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="md:w-2/3">
                                <p>
                                    Traditional online stores are about simple transactions: you exchange money for an item. The story ends there. Leverage is different. We see every trade as a single move in a larger, more rewarding game: your personal <strong>Trade-Up Journey</strong>.
                                </p>
                                <p>
                                    Your inventory isn't just a list of things you own; it's your hand in a strategic game. By combining items and cash into clever "Package Deals," you can trade for assets of higher value or greater personal interest. Your goal isn't just to acquire, but to improve your position and watch your <strong className="text-blue-600">Net Trade Surplus</strong> grow.
                                </p>
                            </div>
                            <div className="md:w-1/3 p-4">
                                <TradeUpJourneyIcon />
                            </div>
                        </div>


                        <h2 className="text-2xl font-bold mt-12 mb-4 text-gray-800">Fairness & Trust: The Valuation Reputation Score</h2>
                        <p>
                            A fair market requires trust. To maintain a level playing field, we use a <strong>Valuation Reputation Score</strong>. This score is crucial to understand, as it's the core of our community's health.
                        </p>
                        <blockquote>
                            <strong>The Golden Rule:</strong> The score does NOT measure whether you made a "good" or "bad" deal. It only measures one thing: <strong>How honestly you represent the market value of your own items.</strong>
                        </blockquote>

                        <h3 className="text-xl font-bold mt-8 mb-2 text-gray-800">How is the score calculated?</h3>
                        <p>
                            After every completed trade, our system analyzes the deal from both sides. It checks if a user's items were valued fairly compared to the items they received.
                        </p>

                        <div className="mt-6 p-6 border border-gray-200 rounded-lg bg-gray-50 flex flex-col md:flex-row items-center gap-6">
                            <div className="md:w-1/4 flex-shrink-0">
                                <FairTradeIcon />
                            </div>
                            <div className="md:w-3/4">
                                <h4 className="font-bold text-lg text-green-700">Example 1: The Fair Trade (Score Increases)</h4>
                                <p className="mt-2">
                                    You offer an item valued at <strong>$100</strong> for another user's item valued at <strong>$100</strong>. The trade is perfectly balanced.
                                </p>
                                <p className="mt-2">
                                   <strong>Result:</strong> Because the values were aligned, both you and the other user have contributed to a fair market. You both receive a <strong>+1 point</strong> boost to your reputation score for being trustworthy traders.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 p-6 border border-gray-200 rounded-lg bg-gray-50 flex flex-col md:flex-row items-center gap-6">
                             <div className="md:w-1/4 flex-shrink-0">
                                <InflatedTradeIcon />
                            </div>
                            <div className="md:w-3/4">
                                <h4 className="font-bold text-lg text-red-700">Example 2: The Inflated Value Trade (Score Decreases)</h4>
                                <p className="mt-2">
                                    You offer items you've valued at a total of <strong>$300</strong>. In exchange, you ask for items valued at only <strong>$200</strong>. The other user, for their own reasons, accepts this deal.
                                </p>
                                <p className="mt-2">
                                   You might think this is a great deal for you, but the system sees it differently.
                                </p>
                                 <p className="mt-2">
                                   <strong>The System's Logic:</strong> The assets you gave away were valued <strong>more than 20% higher</strong> than the assets you received. The system flags this as a potential overvaluation of your items. Its goal is to discourage users from inflating their EMVs to mislead others.
                                </p>
                                 <p className="mt-2">
                                   <strong>Result:</strong> Even though the other user accepted, your `valuationReputationScore` is penalized by <strong>-10 points</strong> because you proposed a deal where your items' stated value was significantly higher than the value you received. The system is not punishing you for "overpaying," but for potentially inflating the value of your assets.
                                </p>
                            </div>
                        </div>

                        <p className="mt-8">
                            By rewarding fair valuation and penalizing inflation, we ensure that the Estimated Market Values (EMVs) on Leverage remain a reliable and trusted guideline for everyone.
                        </p>

                         <h2 className="text-2xl font-bold mt-12 mb-4 text-gray-800">Start Your Journey</h2>
                         <p>
                            Now that you understand the rules of the game, you're ready to play. Browse other traders, craft your first Package Deal, and start your Trade-Up Journey today!
                         </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AboutPage;