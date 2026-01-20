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

    useEffect(() => {
        if (!currentUser) return;

        setLoading(true);
        fetchUserAnalytics(currentUser.id)
            .then(data => {
                setAnalytics(data);
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
        </div>
    );
};

export default AnalyticsDashboard;
