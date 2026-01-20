import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import {
    PieChart, Pie, Cell, Legend,
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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

interface AnalyticsData {
    tradesByDay: { date: string; tradeCount: number; totalValue: number; completedCount: number }[];
    disputesByDay: { date: string; disputeCount: number }[];
    usersByDay: { date: string; userCount: number }[];
    periodDays: number;
}

type Tab = 'overview' | 'trades' | 'disputes' | 'users';
type SortField = 'id' | 'proposerName' | 'receiverName' | 'status' | 'createdAt' | 'proposerCash';
type SortDir = 'asc' | 'desc';

const AdminDashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [trades, setTrades] = useState<AdminTrade[]>([]);
    const [disputes, setDisputes] = useState<AdminDispute[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters and sorting
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [userSearch, setUserSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('createdAt');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [dateRange, setDateRange] = useState({ start: '', end: '' });

    // Modal states
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ type: string; id: number | string; name: string } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

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
            const [statsRes, tradesRes, disputesRes, usersRes, analyticsRes] = await Promise.all([
                fetch(`${API_BASE}/api/admin/stats?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/trades?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/disputes?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/users?userId=${currentUser.id}`),
                fetch(`${API_BASE}/api/admin/analytics?userId=${currentUser.id}&days=30`),
            ]);

            if (!statsRes.ok || !tradesRes.ok || !disputesRes.ok || !usersRes.ok) {
                throw new Error('Failed to load admin data');
            }

            const [statsData, tradesData, disputesData, usersData, analyticsData] = await Promise.all([
                statsRes.json(),
                tradesRes.json(),
                disputesRes.json(),
                usersRes.json(),
                analyticsRes.ok ? analyticsRes.json() : null,
            ]);

            setStats(statsData);
            setTrades(tradesData.trades || []);
            setDisputes(disputesData.disputes || []);
            setUsers(usersData.users || []);
            setAnalytics(analyticsData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Toggle admin action
    const handleToggleAdmin = async (userId: number, userName: string) => {
        setConfirmAction({ type: 'toggleAdmin', id: userId, name: userName });
        setShowConfirmModal(true);
    };

    // Quick resolve dispute
    const handleResolveDispute = async (disputeId: string) => {
        setConfirmAction({ type: 'resolveDispute', id: disputeId, name: `Dispute #${disputeId.slice(0, 8)}` });
        setShowConfirmModal(true);
    };

    const executeAction = async () => {
        if (!confirmAction || !currentUser) return;
        setActionLoading(true);

        try {
            if (confirmAction.type === 'toggleAdmin') {
                const res = await fetch(`${API_BASE}/api/admin/users/${confirmAction.id}/toggle-admin?userId=${currentUser.id}`, {
                    method: 'POST',
                });
                if (!res.ok) throw new Error('Failed to toggle admin status');
                const data = await res.json();
                setUsers(prev => prev.map(u => u.id === confirmAction.id ? { ...u, isAdmin: data.user.isAdmin } : u));
            } else if (confirmAction.type === 'resolveDispute') {
                const res = await fetch(`${API_BASE}/api/admin/disputes/${confirmAction.id}/resolve?userId=${currentUser.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ resolution: 'Resolved by administrator' }),
                });
                if (!res.ok) throw new Error('Failed to resolve dispute');
                setDisputes(prev => prev.map(d => d.id === confirmAction.id ? { ...d, status: 'RESOLVED' } : d));
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setActionLoading(false);
            setShowConfirmModal(false);
            setConfirmAction(null);
        }
    };

    // Sorting handler
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    // Filtered and sorted trades
    const filteredTrades = useMemo(() => {
        let result = [...trades];

        // Status filter
        if (statusFilter) {
            result = result.filter(t => t.status === statusFilter);
        }

        // Date range filter
        if (dateRange.start) {
            result = result.filter(t => new Date(t.createdAt) >= new Date(dateRange.start));
        }
        if (dateRange.end) {
            result = result.filter(t => new Date(t.createdAt) <= new Date(dateRange.end + 'T23:59:59'));
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any = a[sortField];
            let bVal: any = b[sortField];
            if (sortField === 'createdAt') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }
            if (sortField === 'proposerCash') {
                aVal = a.proposerCash + a.receiverCash;
                bVal = b.proposerCash + b.receiverCash;
            }
            if (typeof aVal === 'string') {
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });

        return result;
    }, [trades, statusFilter, dateRange, sortField, sortDir]);

    // Filtered users
    const filteredUsers = useMemo(() => {
        if (!userSearch) return users;
        const search = userSearch.toLowerCase();
        return users.filter(u =>
            u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search)
        );
    }, [users, userSearch]);

    // Sort icon helper
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span className="text-gray-400 ml-1">↕</span>;
        return <span className="text-blue-500 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Confirmation Modal */}
            {showConfirmModal && confirmAction && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {confirmAction.type === 'toggleAdmin' ? '🛡️ Toggle Admin Status' : '⚖️ Resolve Dispute'}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                            {confirmAction.type === 'toggleAdmin'
                                ? `Are you sure you want to toggle admin privileges for ${confirmAction.name}?`
                                : `Are you sure you want to resolve ${confirmAction.name}?`}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setShowConfirmModal(false); setConfirmAction(null); }}
                                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAction}
                                disabled={actionLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {actionLoading ? 'Processing...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                        {/* Trade Volume Line Chart */}
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Trade Volume (Last 30 Days)</h2>
                            {analytics && analytics.tradesByDay.length > 0 ? (
                                <ResponsiveContainer width="100%" height={280}>
                                    <LineChart data={analytics.tradesByDay}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#9CA3AF"
                                            tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        />
                                        <YAxis stroke="#9CA3AF" />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                            labelFormatter={(d) => new Date(d).toLocaleDateString()}
                                        />
                                        <Line type="monotone" dataKey="tradeCount" stroke="#3B82F6" strokeWidth={2} dot={false} name="Trades" />
                                        <Line type="monotone" dataKey="completedCount" stroke="#10B981" strokeWidth={2} dot={false} name="Completed" />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[280px] flex items-center justify-center text-gray-400">
                                    No trade activity in the last 30 days
                                </div>
                            )}
                        </div>

                        {/* Trade Status Pie Chart */}
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
                                        <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
                                        <Legend layout="vertical" align="right" verticalAlign="middle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[280px] flex items-center justify-center text-gray-400">
                                    No trade data yet
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Trades Tab */}
            {activeTab === 'trades' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Trades</h2>
                        <div className="flex-1"></div>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            placeholder="Start date"
                        />
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            placeholder="End date"
                        />
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('id')}>
                                        ID <SortIcon field="id" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('proposerName')}>
                                        Proposer <SortIcon field="proposerName" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('receiverName')}>
                                        Receiver <SortIcon field="receiverName" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('proposerCash')}>
                                        Cash <SortIcon field="proposerCash" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('status')}>
                                        Status <SortIcon field="status" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600" onClick={() => handleSort('createdAt')}>
                                        Date <SortIcon field="createdAt" />
                                    </th>
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
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
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
                                            <td className="px-4 py-3">
                                                {dispute.status !== 'RESOLVED' && (
                                                    <button
                                                        onClick={() => handleResolveDispute(dispute.id)}
                                                        className="px-3 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                                    >
                                                        ✓ Resolve
                                                    </button>
                                                )}
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
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Users</h2>
                        <div className="flex-1"></div>
                        <input
                            type="text"
                            value={userSearch}
                            onChange={e => setUserSearch(e.target.value)}
                            placeholder="Search users..."
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-64"
                        />
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredUsers.map(user => (
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
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleToggleAdmin(user.id, user.name)}
                                                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${user.isAdmin
                                                    ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                                                    }`}
                                            >
                                                {user.isAdmin ? '✕ Remove Admin' : '🛡️ Make Admin'}
                                            </button>
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
