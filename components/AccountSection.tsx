/**
 * Account Section
 * Manage contact information, location, and basic profile settings
 */

import React, { useState } from 'react';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';

interface AccountSectionProps {
    user: User;
    onUpdate: (updates: Partial<User>) => Promise<void>;
}

const AccountSection: React.FC<AccountSectionProps> = ({ user, onUpdate }) => {
    const { oauthProfile } = useAuth();
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleEdit = (field: string, currentValue: string) => {
        setIsEditing(field);
        setEditValue(currentValue || '');
        setError(null);
    };

    const handleSave = async (field: string) => {
        setIsSaving(true);
        setError(null);
        try {
            await onUpdate({ [field]: editValue });
            setIsEditing(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(null);
        setEditValue('');
        setError(null);
    };

    const renderEditableField = (
        field: string,
        label: string,
        value: string | undefined,
        placeholder: string,
        icon: string,
        readonly: boolean = false,
        hint?: string
    ) => (
        <div className="flex items-start justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
            <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{icon}</span>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                    {isEditing === field ? (
                        <div className="mt-1 flex items-center gap-2">
                            <input
                                type={field === 'phone' ? 'tel' : 'text'}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                placeholder={placeholder}
                                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
                                autoFocus
                            />
                            <button
                                onClick={() => handleSave(field)}
                                disabled={isSaving}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                {isSaving ? '...' : 'Save'}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <p className="text-gray-800 dark:text-white font-medium">
                            {value || <span className="text-gray-400 dark:text-gray-500 font-normal">Not set</span>}
                        </p>
                    )}
                    {hint && !isEditing && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>
                    )}
                </div>
            </div>
            {!readonly && !isEditing && (
                <button
                    onClick={() => handleEdit(field, value || '')}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
                >
                    Edit
                </button>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Subscription Status */}
            <div className={`rounded-xl border p-6 ${user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active'
                ? 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-300 dark:border-amber-600'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active'
                            ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                            : 'bg-gray-100 dark:bg-gray-700'
                            }`}>
                            {user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active' ? '✨' : '🎟️'}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                                {user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active'
                                    ? 'Leverage Pro'
                                    : 'Free Plan'
                                }
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active'
                                    ? `${3 - (user.tradesThisCycle || 0)} free trades remaining this month`
                                    : '$15/trade escrow fee applies'
                                }
                            </p>
                        </div>
                    </div>
                    <div>
                        {user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active' ? (
                            <button
                                onClick={async () => {
                                    try {
                                        const response = await fetch('http://localhost:4000/api/subscription/portal', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ userId: user.id }),
                                        });
                                        const data = await response.json();
                                        if (data.portalUrl) {
                                            window.location.href = data.portalUrl;
                                        }
                                    } catch (err) {
                                        console.error('Failed to open portal:', err);
                                    }
                                }}
                                className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900/70 rounded-lg transition-colors"
                            >
                                Manage Subscription
                            </button>
                        ) : (
                            <a
                                href="/pro"
                                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-lg transition-colors inline-block"
                            >
                                Upgrade to Pro
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                    Contact Information
                </h3>
                <div>
                    {renderEditableField(
                        'email',
                        'Email Address',
                        oauthProfile?.email || 'Email not available',
                        'email@example.com',
                        '✉️',
                        true, // Email is readonly (from OAuth)
                        'Connected via Google'
                    )}
                    {renderEditableField(
                        'phone',
                        'Phone Number',
                        (user as any).phone,
                        '(555) 123-4567',
                        '📱',
                        false,
                        'Optional - for trade coordination'
                    )}
                </div>
            </div>

            {/* Location */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                    Location
                </h3>
                <div>
                    <div className="flex items-start justify-between py-4">
                        <div className="flex items-start gap-3">
                            <span className="text-xl mt-0.5">📍</span>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">City, State</p>
                                {isEditing === 'location' ? (
                                    <div className="mt-1 flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                            placeholder="Iowa City, IA"
                                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent w-48"
                                            autoFocus
                                        />
                                        <button
                                            onClick={async () => {
                                                setIsSaving(true);
                                                try {
                                                    await onUpdate({ location: editValue } as any);
                                                    setIsEditing(null);
                                                } catch (err: any) {
                                                    setError(err.message);
                                                } finally {
                                                    setIsSaving(false);
                                                }
                                            }}
                                            disabled={isSaving}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                                        >
                                            {isSaving ? '...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-gray-800 dark:text-white font-medium">
                                        {user.city && user.state
                                            ? `${user.city}, ${user.state}`
                                            : <span className="text-gray-400 dark:text-gray-500 font-normal">Not set</span>
                                        }
                                    </p>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Used for finding nearby traders
                                </p>
                            </div>
                        </div>
                        {!isEditing && (
                            <button
                                onClick={() => handleEdit('location', user.city && user.state ? `${user.city}, ${user.state}` : '')}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 text-sm font-medium"
                            >
                                Edit
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                    Profile Settings
                </h3>
                <div>
                    {renderEditableField(
                        'name',
                        'Display Name',
                        user.name,
                        'Your name',
                        '👤'
                    )}
                    {renderEditableField(
                        'aboutMe',
                        'About Me',
                        user.aboutMe,
                        'Tell other traders about yourself...',
                        '📝'
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountSection;
