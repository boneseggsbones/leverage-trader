import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWishlistMatches, WishlistMatch } from '../api/api.ts';

interface WishlistMatchesProps {
    userId: string | number;
}

const WishlistMatches: React.FC<WishlistMatchesProps> = ({ userId }) => {
    const navigate = useNavigate();
    const [matches, setMatches] = useState<WishlistMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!userId) return;

        setLoading(true);
        fetchWishlistMatches(userId)
            .then(data => setMatches(data))
            .catch(err => console.error('Failed to load wishlist matches:', err))
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) {
        return (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-orange-200 dark:border-gray-600 animate-pulse">
                <div className="h-6 w-40 bg-orange-200 dark:bg-gray-600 rounded mb-4"></div>
                <div className="h-20 bg-orange-100 dark:bg-gray-700 rounded"></div>
            </div>
        );
    }

    if (matches.length === 0) {
        return null; // Don't show section if no matches
    }

    const displayMatches = expanded ? matches : matches.slice(0, 3);

    return (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-orange-200 dark:border-gray-600 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                        🔥
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                            Hot Trade Matches
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Traders who want your items AND have items you want
                        </p>
                    </div>
                </div>
                {matches.length > 0 && (
                    <span className="px-3 py-1 bg-orange-500 text-white rounded-full text-sm font-bold">
                        {matches.length}
                    </span>
                )}
            </div>

            <div className="space-y-3">
                {displayMatches.map(match => (
                    <div
                        key={match.userId}
                        className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-orange-100 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => navigate(`/trade-desk/${match.userId}`)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                                    {match.userName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-white">{match.userName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Match score: {match.matchScore}
                                    </p>
                                </div>
                            </div>
                            <button className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors">
                                Trade Now →
                            </button>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
                                <p className="text-green-700 dark:text-green-400 font-medium mb-1">They want from you:</p>
                                <p className="text-green-600 dark:text-green-300 truncate">
                                    {match.theirWishlistItems.map(i => i.name).join(', ') || 'None'}
                                </p>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                                <p className="text-blue-700 dark:text-blue-400 font-medium mb-1">You want from them:</p>
                                <p className="text-blue-600 dark:text-blue-300 truncate">
                                    {match.yourWishlistItems.map(i => i.name).join(', ') || 'None'}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {matches.length > 3 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-4 w-full text-center text-orange-600 dark:text-orange-400 hover:underline text-sm font-medium"
                >
                    {expanded ? 'Show less' : `View all ${matches.length} matches`}
                </button>
            )}
        </div>
    );
};

export default WishlistMatches;
