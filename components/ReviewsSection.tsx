/**
 * Reviews Section Component
 * Displays user ratings and reviews on their profile
 */

import React, { useState, useEffect } from 'react';

interface Rating {
    id: number;
    trade_id: string;
    rater_id: number;
    ratee_id: number;
    overall_score: number;
    item_accuracy_score: number | null;
    communication_score: number | null;
    shipping_speed_score: number | null;
    public_comment: string | null;
    created_at: string;
    rater_name: string;
}

interface RatingStats {
    totalRatings: number;
    avgOverall: number | null;
    avgItemAccuracy: number | null;
    avgCommunication: number | null;
    avgShippingSpeed: number | null;
}

interface ReviewsSectionProps {
    userId: string | number;
    userName: string;
}

function StarRating({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
    const stars = [];
    const fullStars = Math.floor(score);
    const hasHalf = score % 1 >= 0.5;

    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            stars.push(<span key={i} className={`text-yellow-400 ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>★</span>);
        } else if (i === fullStars + 1 && hasHalf) {
            stars.push(<span key={i} className={`text-yellow-400 ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>½</span>);
        } else {
            stars.push(<span key={i} className={`text-gray-400 ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>☆</span>);
        }
    }
    return <span className="inline-flex">{stars}</span>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function ReviewsSection({ userId, userName }: ReviewsSectionProps) {
    const [ratings, setRatings] = useState<Rating[]>([]);
    const [stats, setStats] = useState<RatingStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        async function loadRatings() {
            try {
                setLoading(true);
                const response = await fetch(`http://localhost:4000/api/users/${userId}/ratings`);
                if (!response.ok) throw new Error('Failed to load ratings');
                const data = await response.json();
                setRatings(data.ratings || []);
                setStats(data.stats);
                setError(null);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        loadRatings();
    }, [userId]);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-red-200 dark:border-red-800 p-6">
                <p className="text-red-600 dark:text-red-400">Error loading reviews: {error}</p>
            </div>
        );
    }

    const displayRatings = showAll ? ratings : ratings.slice(0, 3);
    const positivePercent = stats && stats.totalRatings > 0
        ? Math.round((ratings.filter(r => r.overall_score >= 4).length / stats.totalRatings) * 100)
        : 0;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Reviews
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    What other traders say about {userName}
                </p>
            </div>

            {/* Stats Summary */}
            {stats && stats.totalRatings > 0 && (
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-6">
                        {/* Overall Rating */}
                        <div className="text-center">
                            <div className="text-3xl font-bold text-gray-900 dark:text-white">
                                {stats.avgOverall?.toFixed(1) || '—'}
                            </div>
                            <StarRating score={stats.avgOverall || 0} size="lg" />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {stats.totalRatings} review{stats.totalRatings !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="h-16 w-px bg-gray-200 dark:bg-gray-700"></div>

                        {/* Positive Rating */}
                        <div>
                            <div className="text-2xl font-bold text-green-600">
                                {positivePercent}%
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Positive</p>
                        </div>

                        {/* Category Breakdown */}
                        <div className="flex-1 grid grid-cols-3 gap-2 text-sm">
                            {stats.avgItemAccuracy && (
                                <div>
                                    <p className="text-gray-400 dark:text-gray-500 text-xs">Item Accuracy</p>
                                    <div className="flex items-center gap-1">
                                        <StarRating score={stats.avgItemAccuracy} />
                                        <span className="text-gray-700 dark:text-gray-300">{stats.avgItemAccuracy}</span>
                                    </div>
                                </div>
                            )}
                            {stats.avgCommunication && (
                                <div>
                                    <p className="text-gray-400 dark:text-gray-500 text-xs">Communication</p>
                                    <div className="flex items-center gap-1">
                                        <StarRating score={stats.avgCommunication} />
                                        <span className="text-gray-700 dark:text-gray-300">{stats.avgCommunication}</span>
                                    </div>
                                </div>
                            )}
                            {stats.avgShippingSpeed && (
                                <div>
                                    <p className="text-gray-400 dark:text-gray-500 text-xs">Shipping</p>
                                    <div className="flex items-center gap-1">
                                        <StarRating score={stats.avgShippingSpeed} />
                                        <span className="text-gray-700 dark:text-gray-300">{stats.avgShippingSpeed}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Reviews List */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {ratings.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <span className="text-3xl block mb-2">⭐</span>
                        <p>No reviews yet</p>
                        <p className="text-sm mt-1 text-gray-400 dark:text-gray-500">
                            Complete trades to receive reviews
                        </p>
                    </div>
                ) : (
                    displayRatings.map((rating) => (
                        <div key={rating.id} className="px-6 py-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <StarRating score={rating.overall_score} />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {rating.rater_name || 'Anonymous'}
                                        </span>
                                    </div>
                                    {rating.public_comment && (
                                        <p className="text-gray-600 dark:text-gray-300 mt-2 text-sm">
                                            "{rating.public_comment}"
                                        </p>
                                    )}
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                                        {formatDate(rating.created_at)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Show More */}
            {ratings.length > 3 && (
                <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-center">
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        {showAll ? 'Show less' : `Show all ${ratings.length} reviews`}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ReviewsSection;
