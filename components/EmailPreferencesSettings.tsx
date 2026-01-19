/**
 * Email Preferences Settings
 * Toggle switches for email notification preferences
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface EmailPreferences {
    userId: number;
    tradeProposed: boolean;
    tradeAccepted: boolean;
    escrowFunded: boolean;
    tradeCompleted: boolean;
    counterOffer: boolean;
    disputeOpened: boolean;
}

interface PreferenceOption {
    key: keyof Omit<EmailPreferences, 'userId'>;
    label: string;
    description: string;
    icon: string;
}

const PREFERENCE_OPTIONS: PreferenceOption[] = [
    {
        key: 'tradeProposed',
        label: 'New Trade Proposals',
        description: 'When someone sends you a trade offer',
        icon: '📨',
    },
    {
        key: 'tradeAccepted',
        label: 'Trade Accepted',
        description: 'When your trade proposal is accepted',
        icon: '✅',
    },
    {
        key: 'escrowFunded',
        label: 'Payment Updates',
        description: 'When escrow is funded for a trade',
        icon: '💰',
    },
    {
        key: 'tradeCompleted',
        label: 'Trade Completed',
        description: 'When a trade is fully completed',
        icon: '🎉',
    },
    {
        key: 'counterOffer',
        label: 'Counter Offers',
        description: 'When you receive a counter offer',
        icon: '🔄',
    },
    {
        key: 'disputeOpened',
        label: 'Dispute Alerts',
        description: 'When a dispute is opened on your trade',
        icon: '⚠️',
    },
];

const EmailPreferencesSettings: React.FC = () => {
    const { currentUser } = useAuth();
    const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch preferences on mount
    useEffect(() => {
        if (!currentUser?.id) return;

        fetch(`http://localhost:4000/api/email-preferences/${currentUser.id}`)
            .then((res) => res.json())
            .then((data) => {
                setPreferences(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Failed to load email preferences:', err);
                setError('Failed to load preferences');
                setLoading(false);
            });
    }, [currentUser?.id]);

    const handleToggle = async (key: keyof Omit<EmailPreferences, 'userId'>) => {
        if (!currentUser?.id || !preferences) return;

        const newValue = !preferences[key];
        setSaving(key);
        setError(null);

        try {
            const res = await fetch(`http://localhost:4000/api/email-preferences/${currentUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: newValue }),
            });

            if (!res.ok) {
                throw new Error('Failed to update preference');
            }

            setPreferences({ ...preferences, [key]: newValue });
        } catch (err) {
            console.error('Failed to update preference:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Loading preferences...</p>
                </div>
            </div>
        );
    }

    if (!preferences) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <p className="text-center text-gray-500 dark:text-gray-400">Unable to load email preferences</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            {/* Header */}
            <div className="mb-5">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    📧 Email Notifications
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Choose which trade events send you email alerts
                </p>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* Preferences List */}
            <div className="space-y-3">
                {PREFERENCE_OPTIONS.map((option) => (
                    <div
                        key={option.key}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl w-8 text-center">{option.icon}</span>
                            <div>
                                <p className="font-medium text-gray-800 dark:text-white text-sm">
                                    {option.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {option.description}
                                </p>
                            </div>
                        </div>

                        {/* Toggle Switch */}
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={preferences[option.key]}
                                onChange={() => handleToggle(option.key)}
                                disabled={saving === option.key}
                            />
                            <div className={`
                                w-11 h-6 rounded-full peer
                                bg-gray-300 dark:bg-gray-600
                                peer-checked:bg-blue-600
                                peer-focus:ring-4 peer-focus:ring-blue-100 dark:peer-focus:ring-blue-900
                                peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
                                after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                                after:bg-white after:rounded-full after:h-5 after:w-5
                                after:transition-all after:shadow-sm
                                peer-checked:after:translate-x-5
                                transition-colors
                            `}>
                                {saving === option.key && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                        </label>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default EmailPreferencesSettings;
