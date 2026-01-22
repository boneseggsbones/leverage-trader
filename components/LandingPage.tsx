import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                            LEVERAGE
                        </span>
                        <span className="text-orange-500 text-xl">↗</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            to="/login"
                            className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                        >
                            Log In
                        </Link>
                        <Link
                            to="/login"
                            className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-full shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 transition-all hover:-translate-y-0.5"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                                Trade Up Your{' '}
                                <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                                    Collection
                                </span>
                            </h1>
                            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                                Turn your collectibles into exactly what you want.{' '}
                                <span className="text-indigo-600 font-medium">No fees, just fair trades.</span>
                            </p>

                            {/* ELI5 Explanation */}
                            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-6 mb-8 border border-indigo-100">
                                <p className="text-gray-700 leading-relaxed">
                                    <span className="text-2xl mr-2">🎮</span>
                                    <strong>Think of it like this:</strong> You have a Game Boy you don't play anymore.
                                    Someone else has a Pokémon card you've always wanted.
                                    We help you find each other and make the swap happen — safely and fairly.
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-4">
                                <Link
                                    to="/login"
                                    className="px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-lg rounded-full shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all hover:-translate-y-1"
                                >
                                    Start Trading Free →
                                </Link>
                                <a
                                    href="#how-it-works"
                                    className="px-8 py-4 bg-white text-gray-700 font-semibold text-lg rounded-full border-2 border-gray-200 hover:border-indigo-300 hover:text-indigo-600 transition-all"
                                >
                                    See How It Works
                                </a>
                            </div>
                        </div>

                        <div className="relative">
                            <img
                                src="/landing-hero.png"
                                alt="Trade up your collection"
                                className="w-full rounded-2xl shadow-2xl"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Bar */}
            <section className="py-12 bg-gradient-to-r from-indigo-600 to-violet-600">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
                        <div>
                            <p className="text-4xl font-bold">0%</p>
                            <p className="text-indigo-200 mt-1">Trading Fees</p>
                        </div>
                        <div>
                            <p className="text-4xl font-bold">$0</p>
                            <p className="text-indigo-200 mt-1">To Get Started</p>
                        </div>
                        <div>
                            <p className="text-4xl font-bold">24/7</p>
                            <p className="text-indigo-200 mt-1">Escrow Protection</p>
                        </div>
                        <div>
                            <p className="text-4xl font-bold">🔥</p>
                            <p className="text-indigo-200 mt-1">Smart Matching</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-24 px-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            How It Works
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Three simple steps to turn what you have into what you want
                        </p>
                    </div>

                    <img
                        src="/how-it-works.png"
                        alt="How Leverage works"
                        className="w-full max-w-4xl mx-auto rounded-2xl shadow-lg mb-16"
                    />

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-6 shadow-lg shadow-indigo-500/30">
                                📦
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">1. Add Your Items</h3>
                            <p className="text-gray-600 leading-relaxed">
                                Snap photos or import from eBay. We'll automatically value everything using real market data.
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-6 shadow-lg shadow-orange-500/30">
                                🔥
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">2. Get Matched</h3>
                            <p className="text-gray-600 leading-relaxed">
                                Our smart matching finds traders who want what you have AND have what you want. Win-win!
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-6 shadow-lg shadow-green-500/30">
                                🎉
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">3. Trade Safely</h3>
                            <p className="text-gray-600 leading-relaxed">
                                Our escrow system protects both sides. Money is only released when everyone's happy.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* What You Can Trade */}
            <section className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            What Can You Trade?
                        </h2>
                        <p className="text-xl text-gray-600">
                            Pretty much anything collectible
                        </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { emoji: '🎴', name: 'Trading Cards', examples: 'Pokémon, Magic, Sports' },
                            { emoji: '🎮', name: 'Video Games', examples: 'Retro, Modern, Consoles' },
                            { emoji: '👟', name: 'Sneakers', examples: 'Jordan, Nike, Yeezy' },
                            { emoji: '📱', name: 'Electronics', examples: 'Phones, Tablets, Cameras' },
                            { emoji: '🎸', name: 'Instruments', examples: 'Guitars, Amps, Pedals' },
                            { emoji: '⌚', name: 'Watches', examples: 'Vintage, Luxury, Smart' },
                            { emoji: '🧸', name: 'Toys & Figures', examples: 'LEGO, Funko, Action Figures' },
                            { emoji: '📚', name: 'Comics & Books', examples: 'First Editions, Manga, Rare' },
                        ].map((category) => (
                            <div
                                key={category.name}
                                className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer border border-gray-100"
                            >
                                <span className="text-4xl mb-3 block">{category.emoji}</span>
                                <h3 className="font-bold text-gray-900 mb-1">{category.name}</h3>
                                <p className="text-sm text-gray-500">{category.examples}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Trust Section */}
            <section className="py-24 px-6 bg-gradient-to-br from-indigo-900 to-violet-900 text-white">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl font-bold mb-6">
                        Built for Trust
                    </h2>
                    <p className="text-xl text-indigo-200 mb-12 max-w-2xl mx-auto">
                        We know trading with strangers can be scary. That's why we built Leverage with safety first.
                    </p>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
                            <div className="text-3xl mb-4">🔒</div>
                            <h3 className="font-bold text-lg mb-2">Secure Escrow</h3>
                            <p className="text-indigo-200 text-sm">
                                Money is held safely until both parties confirm they received their items
                            </p>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
                            <div className="text-3xl mb-4">💰</div>
                            <h3 className="font-bold text-lg mb-2">Fair Valuations</h3>
                            <p className="text-indigo-200 text-sm">
                                Real market prices from eBay, PriceCharting, and PSA data
                            </p>
                        </div>
                        <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
                            <div className="text-3xl mb-4">⭐</div>
                            <h3 className="font-bold text-lg mb-2">Verified Reviews</h3>
                            <p className="text-indigo-200 text-sm">
                                See detailed ratings and trade history before you deal
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-24 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl font-bold text-gray-900 mb-6">
                        Ready to Trade Up?
                    </h2>
                    <p className="text-xl text-gray-600 mb-8">
                        Join thousands of collectors turning their stuff into exactly what they want.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block px-10 py-5 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold text-xl rounded-full shadow-xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all hover:-translate-y-1"
                    >
                        Get Started — It's Free →
                    </Link>
                    <p className="text-sm text-gray-500 mt-6">
                        No credit card required. No fees ever.
                    </p>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-12 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-bold text-white">LEVERAGE</span>
                            <span className="text-orange-500">↗</span>
                        </div>
                        <p className="text-sm">
                            © {new Date().getFullYear()} Leverage. Trade smarter, not harder.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
