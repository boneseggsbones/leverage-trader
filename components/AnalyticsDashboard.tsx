import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchUserAnalytics, UserAnalytics } from '../api/api';
import { formatCurrency } from '../utils/currency';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import Skeleton from './Skeleton';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const STATUS_LABELS: Record<string, string> = {
    'PENDING_ACCEPTANCE': 'Pending',
    'ACCEPTED': 'Accepted',
    'REJECTED': 'Rejected',
    'CANCELLED': 'Cancelled',
    'COMPLETED': 'Completed',
    'COMPLETED_AWAITING_RATING': 'Awaiting Rating',
    'IN_TRANSIT': 'In Transit',
    'SHIPPING_PENDING': 'Shipping Pending',
    'DISPUTE_OPENED': 'Disputed',
    'DISPUTE_RESOLVED': 'Dispute Resolved',
    'COUNTERED': 'Countered',
};

const AnalyticsDashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const [analytics, setAnalytics] = useState<UserAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // API Call Statistics
    const [apiStats, setApiStats] = useState<Array<{
        api_name: string;
        call_count: number;
        last_called_at: string | null;
        error_count: number;
        last_error: string | null;
    }>>([]);

    // API Call Log (detailed)
    const [apiCallLog, setApiCallLog] = useState<Array<{
        id: number;
        api_name: string;
        item_name: string | null;
        request_query: string | null;
        response_summary: string | null;
        price_returned: number | null;
        success: number;
        error_message: string | null;
        duration_ms: number | null;
        created_at: string;
    }>>([]);

    // Expanded API (for showing call log)
    const [expandedApi, setExpandedApi] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser) return;

        setLoading(true);
        Promise.all([
            fetchUserAnalytics(currentUser.id),
            fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/analytics/api-stats`)
                .then(res => res.json())
                .catch(() => []),
            fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'}/api/analytics/api-call-log?limit=50`)
                .then(res => res.json())
                .catch(() => [])
        ])
            .then(([data, stats, log]) => {
                setAnalytics(data);
                setApiStats(stats || []);
                setApiCallLog(log || []);
                setError(null);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [currentUser]);

    if (!currentUser) return null;

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                    <div className="animate-pulse flex items-start gap-4">
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                        <div className="flex-1">
                            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-48 mb-2"></div>
                            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                            <Skeleton className="h-4 w-24 mb-2" />
                            <Skeleton className="h-8 w-20" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="text-center text-red-500 py-8">{error}</div>
            </div>
        );
    }

    if (!analytics) return null;

    // Format month labels for chart
    const chartData = analytics.tradesByMonth.map(item => ({
        ...item,
        label: new Date(item.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    }));

    // Format status data for pie chart
    const statusData = analytics.tradesByStatus.map(item => ({
        name: STATUS_LABELS[item.status] || item.status,
        value: item.count
    }));

    const surplusColor = analytics.netTradeSurplus >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    const surplusPrefix = analytics.netTradeSurplus >= 0 ? '+' : '';

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-purple-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 text-4xl bg-gradient-to-br from-purple-500 to-indigo-600 p-3 rounded-xl shadow-lg">
                        📊
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
                            Trading Analytics
                        </h1>
                        <p className="text-slate-600 dark:text-gray-300 mt-1">
                            Track your trading performance, history, and ratings
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Total Trades</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{analytics.totalTrades}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{analytics.completedTrades} completed</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Value Traded</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">{formatCurrency(analytics.totalValueTraded)}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Net Surplus</p>
                    <p className={`text-2xl sm:text-3xl font-bold truncate ${surplusColor}`}>
                        {surplusPrefix}{formatCurrency(Math.abs(analytics.netTradeSurplus))}
                    </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">Average Rating</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        {analytics.avgRating ? `${analytics.avgRating} ★` : 'N/A'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{analytics.ratingCount} reviews</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Trade Activity Chart */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trade Activity</h2>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                                <XAxis dataKey="label" stroke="#9CA3AF" fontSize={12} />
                                <YAxis stroke="#9CA3AF" fontSize={12} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1F2937',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: '#fff'
                                    }}
                                />
                                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-gray-400">
                            No trade data yet
                        </div>
                    )}
                </div>

                {/* Status Breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trade Status Breakdown</h2>
                    {statusData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {statusData.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#1F2937',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: '#fff'
                                    }}
                                />
                                <Legend
                                    layout="vertical"
                                    align="right"
                                    verticalAlign="middle"
                                    wrapperStyle={{ fontSize: '12px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[250px] flex items-center justify-center text-gray-400">
                            No status data yet
                        </div>
                    )}
                </div>
            </div>

            {/* Top Trading Partners */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Trading Partners</h2>
                {analytics.topTradingPartners.length > 0 ? (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {analytics.topTradingPartners.map((partner, index) => (
                            <div key={partner.userId} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                                        }`}>
                                        {index + 1}
                                    </div>
                                    <span className="text-gray-900 dark:text-white font-medium">{partner.name}</span>
                                </div>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {partner.count} trade{partner.count !== 1 ? 's' : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-gray-400 py-8">
                        No trading partners yet. Start trading to see your partners here!
                    </div>
                )}
            </div>

            {/* API Usage Statistics */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm mt-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <span className="text-xl">🔌</span> API Usage Statistics
                    <span className="text-xs text-gray-400 font-normal ml-2">(click to expand)</span>
                </h2>
                <div className="space-y-3">
                    {apiStats.map((stat) => {
                        const icons: Record<string, string> = {
                            'PriceCharting': '📊',
                            'RapidAPI eBay': '⚡',
                            'JustTCG': '🃏',
                            'StockX': '👟',
                            'PSA': '🏆'
                        };
                        const isExpanded = expandedApi === stat.api_name;
                        const callsForApi = apiCallLog.filter(c => c.api_name === stat.api_name);

                        return (
                            <div key={stat.api_name}>
                                {/* API Header - Clickable */}
                                <button
                                    onClick={() => setExpandedApi(isExpanded ? null : stat.api_name)}
                                    className={`w-full rounded-xl p-4 text-left transition-all ${stat.call_count > 0
                                        ? 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-700 hover:border-violet-400'
                                        : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'
                                        } ${isExpanded ? 'ring-2 ring-violet-400' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{icons[stat.api_name] || '🔗'}</span>
                                            <div>
                                                <p className="font-medium text-gray-800 dark:text-white">{stat.api_name}</p>
                                                {stat.last_called_at && (
                                                    <p className="text-xs text-gray-500">
                                                        Last: {new Date(stat.last_called_at).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className={`text-2xl font-bold ${stat.call_count > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'
                                                    }`}>
                                                    {stat.call_count.toLocaleString()}
                                                </p>
                                                <p className="text-xs text-gray-500">calls</p>
                                            </div>
                                            {stat.error_count > 0 && (
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-amber-500">{stat.error_count}</p>
                                                    <p className="text-xs text-amber-500">errors</p>
                                                </div>
                                            )}
                                            <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                                        </div>
                                    </div>
                                </button>

                                {/* Expanded Call Log */}
                                {isExpanded && callsForApi.length > 0 && (
                                    <div className="mt-2 ml-4 border-l-2 border-violet-200 dark:border-violet-700 pl-4 space-y-2">
                                        {callsForApi.map(call => (
                                            <div
                                                key={call.id}
                                                className={`rounded-lg p-3 text-sm ${call.success
                                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700'
                                                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <p className="font-medium text-gray-800 dark:text-white">
                                                            {call.item_name || 'Unknown item'}
                                                        </p>
                                                        {call.request_query && (
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                📤 <span className="font-mono">{call.request_query}</span>
                                                            </p>
                                                        )}
                                                        {call.response_summary && (
                                                            <p className={`text-xs mt-1 ${call.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                📥 {call.response_summary}
                                                            </p>
                                                        )}
                                                        {call.error_message && (
                                                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                                ❌ {call.error_message}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right flex-shrink-0 ml-3">
                                                        {call.price_returned && call.price_returned > 0 && (
                                                            <p className="font-bold text-green-600 dark:text-green-400">
                                                                ${(call.price_returned / 100).toFixed(2)}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-gray-400">
                                                            {new Date(call.created_at).toLocaleTimeString()}
                                                        </p>
                                                        {call.duration_ms && (
                                                            <p className="text-xs text-gray-400">{call.duration_ms}ms</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {isExpanded && callsForApi.length === 0 && (
                                    <div className="mt-2 ml-4 text-sm text-gray-400 py-2">
                                        No detailed call logs available for this API yet.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {apiStats.length === 0 && (
                    <p className="text-center text-gray-400 py-4">No API calls recorded yet</p>
                )}
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
