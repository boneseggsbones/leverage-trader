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
            <div className="email-preferences-loading">
                <div className="spinner" />
                <p>Loading preferences...</p>
            </div>
        );
    }

    if (!preferences) {
        return (
            <div className="email-preferences-error">
                <p>Unable to load email preferences</p>
            </div>
        );
    }

    return (
        <div className="email-preferences-settings">
            <div className="preferences-header">
                <h3>📧 Email Notifications</h3>
                <p className="preferences-description">
                    Choose which trade events send you email alerts
                </p>
            </div>

            {error && <div className="preferences-error">{error}</div>}

            <div className="preferences-list">
                {PREFERENCE_OPTIONS.map((option) => (
                    <div key={option.key} className="preference-item">
                        <div className="preference-info">
                            <span className="preference-icon">{option.icon}</span>
                            <div className="preference-text">
                                <span className="preference-label">{option.label}</span>
                                <span className="preference-description">{option.description}</span>
                            </div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={preferences[option.key]}
                                onChange={() => handleToggle(option.key)}
                                disabled={saving === option.key}
                            />
                            <span className="toggle-slider">
                                {saving === option.key && <span className="toggle-spinner" />}
                            </span>
                        </label>
                    </div>
                ))}
            </div>

            <style>{`
                .email-preferences-settings {
                    background: var(--card-bg, #1e293b);
                    border-radius: 12px;
                    padding: 24px;
                    margin-top: 24px;
                }

                .preferences-header h3 {
                    margin: 0 0 8px 0;
                    font-size: 18px;
                    color: var(--text-primary, #f8fafc);
                }

                .preferences-header .preferences-description {
                    margin: 0;
                    font-size: 14px;
                    color: var(--text-secondary, #94a3b8);
                }

                .preferences-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                    padding: 12px;
                    border-radius: 8px;
                    margin: 16px 0;
                    font-size: 14px;
                }

                .preferences-list {
                    margin-top: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .preference-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: var(--card-bg-secondary, #0f172a);
                    border-radius: 10px;
                    transition: background 0.2s ease;
                }

                .preference-item:hover {
                    background: var(--card-bg-hover, #1e293b);
                }

                .preference-info {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }

                .preference-icon {
                    font-size: 24px;
                    width: 32px;
                    text-align: center;
                }

                .preference-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .preference-label {
                    font-weight: 500;
                    color: var(--text-primary, #f8fafc);
                    font-size: 15px;
                }

                .preference-description {
                    font-size: 13px;
                    color: var(--text-secondary, #64748b);
                }

                /* Toggle Switch */
                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 48px;
                    height: 26px;
                    flex-shrink: 0;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: #475569;
                    transition: 0.3s;
                    border-radius: 26px;
                }

                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 20px;
                    width: 20px;
                    left: 3px;
                    bottom: 3px;
                    background: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }

                .toggle-switch input:checked + .toggle-slider {
                    background: linear-gradient(135deg, #3b82f6, #6366f1);
                }

                .toggle-switch input:checked + .toggle-slider:before {
                    transform: translateX(22px);
                }

                .toggle-switch input:disabled + .toggle-slider {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .toggle-spinner {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes spin {
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }

                .email-preferences-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    color: var(--text-secondary, #94a3b8);
                }

                .email-preferences-loading .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid rgba(59, 130, 246, 0.2);
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin-bottom: 12px;
                }

                .email-preferences-error {
                    padding: 24px;
                    text-align: center;
                    color: var(--text-secondary, #94a3b8);
                }
            `}</style>
        </div>
    );
};

export default EmailPreferencesSettings;
