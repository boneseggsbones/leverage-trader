import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import Skeleton from './Skeleton';

const API_BASE = 'http://localhost:4000';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const STATUS_LABELS: Record<string, string> = {
    'PENDING_ACCEPTANCE': 'Pending',
    'ACCEPTED': 'Accepted',
    'REJECTED': 'Rejected',
    'CANCELLED': 'Cancelled',
    'COMPLETED': 'Completed',
    'COMPLETED_AWAITING_RATING': 'Awaiting Rating',
    'IN_TRANSIT': 'In Transit',
    'SHIPPING_PENDING': 'Shipping',
    'PAYMENT_PENDING': 'Payment Pending',
    'ESCROW_FUNDED': 'Escrow Funded',
    'DISPUTE_OPENED': 'Disputed',
    'DISPUTE_RESOLVED': 'Resolved',
    'COUNTERED': 'Countered',
};

const STATUS_COLORS: Record<string, string> = {
    'PENDING_ACCEPTANCE': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    'COMPLETED': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    'CANCELLED': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    'REJECTED': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    'DISPUTE_OPENED': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    'DISPUTE_RESOLVED': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'IN_TRANSIT': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    'ESCROW_FUNDED': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
};

interface AdminStats {
    totalUsers: number;
    totalItems: number;
    totalTrades: number;
    tradesByStatus: Record<string, number>;
    totalDisputes: number;
    openDisputes: number;
    escrowHeldCents: number;
    totalTradeValueCents: number;
}

interface AdminTrade {
    id: string;
    proposerId: string;
    receiverId: string;
    proposerName: string;
    receiverName: string;
    proposerCash: number;
    receiverCash: number;
    status: string;
    createdAt: string;
}

interface AdminDispute {
    id: string;
    trade_id: string;
    initiator_id: number;
    respondent_id: number;
    initiatorName: string;
    respondentName: string;
    dispute_type: string;
    status: string;
    created_at: string;
}

interface AdminUser {
    id: number;
    name: string;
    email: string;
    rating: number;
    balance: number;
    tradeCount: number;
    itemCount: number;
    isAdmin: number;
}

type Tab = 'overview' | 'trades' | 'disputes' | 'users';

const AdminDashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [trades, setTrades] = useState<AdminTrade[]>([]);
    const [disputes, setDisputes] = useState<AdminDispute[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('');

    useEffect(() => {
        if (!currentUser?.isAdmin) {
            navigate('/');
            return;
        }
        loadData();
    }, [currentUser, navigate]);

    const loadData = async () => {
        if (!currentUser) return;
        setLoading(true);
        setError(null);

        try {
            // Load all data in parallel
            const [statsRes, tradesRes, disputesRes, usersRes] = await Promise.all([
                fetch(`${API_BASE}/api/admin/stats?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/trades?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/disputes?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/users?userId=${currentUser.id}`),
            ]);

            if (!statsRes.ok || !tradesRes.ok || !disputesRes.ok || !usersRes.ok) {
                throw new Error('Failed to load admin data');
            }

            const [statsData, tradesData, disputesData, usersData] = await Promise.all([
                statsRes.json(),
                tradesRes.json(),
                disputesRes.json(),
                usersRes.json(),
            ]);

            setStats(statsData);
            setTrades(tradesData.trades || []);
            setDisputes(disputesData.disputes || []);
            setUsers(usersData.users || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!currentUser?.isAdmin) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
                <p className="text-gray-500 dark:text-gray-400">You don't have permission to access this page.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8 bg-gradient-to-r from-slate-50 to-red-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600">
                    <div className="animate-pulse flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-xl"></div>
                        <div className="flex-1">
                            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-48 mb-2"></div>
                            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-64"></div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <div className="text-6xl mb-4">⚠️</div>
                <h1 className="text-2xl font-bold text-red-600 mb-2">Error Loading Data</h1>
                <p className="text-gray-500 dark:text-gray-400">{error}</p>
                <button onClick={loadData} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Retry
                </button>
            </div>
        );
    }

    // Prepare chart data
    const statusChartData = stats ? Object.entries(stats.tradesByStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count
    })) : [];

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'trades', label: 'Trades', icon: '🤝' },
        { id: 'disputes', label: 'Disputes', icon: '⚖️' },
        { id: 'users', label: 'Users', icon: '👥' },
    ];

    const filteredTrades = statusFilter
        ? trades.filter(t => t.status === statusFilter)
        : trades;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8 bg-gradient-to-r from-slate-50 to-red-50 dark:from-gray-800 dark:to-red-900/20 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 text-4xl bg-gradient-to-br from-red-500 to-orange-600 p-3 rounded-xl shadow-lg">
                        🛡️
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
                            Admin Dashboard
                        </h1>
                        <p className="text-slate-600 dark:text-gray-300 mt-1">
                            Platform oversight: trades, disputes, users, and analytics
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && stats && (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Users</p>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalUsers}</p>
                            <p className="text-xs text-blue-500 mt-1">👥 Platform members</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Trades</p>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.totalTrades}</p>
                            <p className="text-xs text-green-500 mt-1">🤝 All time</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Open Disputes</p>
                            <p className={`text-3xl font-bold ${stats.openDisputes > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                                {stats.openDisputes}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">⚖️ {stats.totalDisputes} total</p>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Escrow Held</p>
                            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(stats.escrowHeldCents)}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">💰 In custody</p>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trade Status Distribution</h2>
                            {statusChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie
                                            data={statusChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {statusChartData.map((_, index) => (
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
                                        <Legend layout="vertical" align="right" verticalAlign="middle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[280px] flex items-center justify-center text-gray-400">
                                    No trade data yet
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Platform Summary</h2>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="text-gray-600 dark:text-gray-300">Total Items Listed</span>
                                    <span className="font-bold text-gray-900 dark:text-white">{stats.totalItems}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="text-gray-600 dark:text-gray-300">Total Trade Value</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(stats.totalTradeValueCents)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="text-gray-600 dark:text-gray-300">Dispute Rate</span>
                                    <span className="font-bold text-gray-900 dark:text-white">
                                        {stats.totalTrades > 0
                                            ? ((stats.totalDisputes / stats.totalTrades) * 100).toFixed(1)
                                            : 0}%
                                    </span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <span className="text-gray-600 dark:text-gray-300">Avg Trades per User</span>
                                    <span className="font-bold text-gray-900 dark:text-white">
                                        {stats.totalUsers > 0
                                            ? (stats.totalTrades / stats.totalUsers).toFixed(1)
                                            : 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Trades Tab */}
            {activeTab === 'trades' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Trades</h2>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        >
                            <option value="">All Statuses</option>
                            {Object.keys(STATUS_LABELS).map(status => (
                                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                            ))}
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Proposer</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Receiver</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cash</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredTrades.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No trades found</td>
                                    </tr>
                                ) : (
                                    filteredTrades.map(trade => (
                                        <tr key={trade.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">
                                                {trade.id.slice(0, 12)}...
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{trade.proposerName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{trade.receiverName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                {trade.proposerCash > 0 && <span className="text-red-500">-{formatCurrency(trade.proposerCash)}</span>}
                                                {trade.receiverCash > 0 && <span className="text-green-500">+{formatCurrency(trade.receiverCash)}</span>}
                                                {trade.proposerCash === 0 && trade.receiverCash === 0 && <span>—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[trade.status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                    {STATUS_LABELS[trade.status] || trade.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(trade.createdAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Disputes Tab */}
            {activeTab === 'disputes' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Disputes</h2>
                    </div>
                    {disputes.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="text-4xl mb-4">✨</div>
                            <p className="text-gray-500 dark:text-gray-400">No disputes! The community is trading peacefully.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Initiator</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Respondent</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {disputes.map(dispute => (
                                        <tr key={dispute.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">
                                                {dispute.id.slice(0, 16)}...
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{dispute.initiatorName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{dispute.respondentName}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{dispute.dispute_type}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${dispute.status === 'RESOLVED'
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                        : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                                                    }`}>
                                                    {dispute.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(dispute.created_at).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Users</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rating</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trades</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Items</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {users.map(user => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-mono text-gray-600 dark:text-gray-300">{user.id}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{user.name}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{user.email}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {user.rating ? (
                                                <span className="text-yellow-500">{user.rating.toFixed(1)} ★</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                            {formatCurrency(user.balance)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{user.tradeCount}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{user.itemCount}</td>
                                        <td className="px-4 py-3">
                                            {user.isAdmin ? (
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                                    Admin
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                                    User
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
