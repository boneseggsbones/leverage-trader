/**
 * Plaid Link Button Component
 * Opens Plaid Link for bank account connection
 */

import React, { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { createPlaidLinkToken, exchangePlaidToken } from '../api/api';

interface PlaidLinkButtonProps {
    userId: string | number;
    onSuccess: (method: {
        id: number;
        provider: string;
        displayName: string;
        lastFour: string;
    }) => void;
    onCancel: () => void;
}

const PlaidLinkButton: React.FC<PlaidLinkButtonProps> = ({ userId, onSuccess, onCancel }) => {
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExchanging, setIsExchanging] = useState(false);

    // Fetch link token on mount
    useEffect(() => {
        const fetchLinkToken = async () => {
            try {
                const result = await createPlaidLinkToken(userId);
                setLinkToken(result.linkToken);
                setError(null);
            } catch (err: any) {
                setError(err.message || 'Failed to initialize bank connection');
            } finally {
                setIsLoading(false);
            }
        };
        fetchLinkToken();
    }, [userId]);

    const handleSuccess = useCallback(async (publicToken: string, metadata: any) => {
        setIsExchanging(true);
        try {
            const result = await exchangePlaidToken(userId, publicToken, metadata);
            onSuccess({
                id: result.id,
                provider: result.provider,
                displayName: result.displayName,
                lastFour: result.lastFour,
            });
        } catch (err: any) {
            setError(err.message || 'Failed to connect bank account');
            setIsExchanging(false);
        }
    }, [userId, onSuccess]);

    const handleExit = useCallback(() => {
        // User exited without completing
        // Don't call onCancel here since they might retry
    }, []);

    const { open, ready } = usePlaidLink({
        token: linkToken,
        onSuccess: handleSuccess,
        onExit: handleExit,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500" />
                <span className="ml-2 text-gray-500 dark:text-gray-400">Setting up bank connection...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Securely connect your bank account to receive payouts when trades complete.
            </p>

            <button
                onClick={() => open()}
                disabled={!ready || isExchanging}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
                {isExchanging ? (
                    <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Connecting...
                    </>
                ) : (
                    <>
                        🏦 Connect Bank Account
                    </>
                )}
            </button>

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    Cancel
                </button>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                🔒 Secured by Plaid. Your login credentials are never stored.
            </p>
        </div>
    );
};

export default PlaidLinkButton;
