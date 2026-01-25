import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://localhost:4000';
const SETUP_COMPLETE_KEY = 'leverage_user_setup_complete';

interface NewUserSetupModalProps {
    show: boolean;
    onComplete: () => void;
}

const NewUserSetupModal: React.FC<NewUserSetupModalProps> = ({ show, onComplete }) => {
    const { currentUser, updateUser } = useAuth();
    const [username, setUsername] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zipCode, setZipCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState<'username' | 'location'>('username');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (show && currentUser) {
            // Pre-fill with existing data
            setUsername(currentUser.name || '');
            setCity(currentUser.city || '');
            setState(currentUser.state || '');
        }
    }, [show, currentUser]);

    useEffect(() => {
        if (show && inputRef.current) {
            inputRef.current.focus();
        }
    }, [show, step]);

    // Look up city/state from zip code
    useEffect(() => {
        if (zipCode.length === 5) {
            fetch(`${API_URL}/api/zipcode/${zipCode}`)
                .then(res => {
                    if (!res.ok) throw new Error('Not found');
                    return res.json();
                })
                .then(data => {
                    if (data.city && data.state) {
                        setCity(data.city);
                        setState(data.state);
                    }
                })
                .catch(() => { /* ignore */ });
        }
    }, [zipCode]);

    const handleUsernameNext = () => {
        if (!username.trim()) {
            setError('Please enter a username');
            return;
        }
        if (username.length < 3) {
            setError('Username must be at least 3 characters');
            return;
        }
        setError('');
        setStep('location');
    };

    const handleComplete = async () => {
        if (!city.trim() || !state.trim()) {
            setError('Please enter your city and state');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Update user profile
            const res = await fetch(`${API_URL}/api/users/${currentUser?.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: username.trim(),
                    city: city.trim(),
                    state: state.trim()
                })
            });

            if (!res.ok) throw new Error('Failed to update profile');

            const updatedUser = await res.json();
            updateUser(updatedUser);

            // Mark setup as complete
            localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
            onComplete();
        } catch (err) {
            setError('Failed to save. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!show) return null;

    const modal = (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 animate-scale-in">
                {/* Progress indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    <div className={`w-3 h-3 rounded-full ${step === 'username' ? 'bg-indigo-500' : 'bg-indigo-300'}`} />
                    <div className={`w-12 h-1 ${step === 'location' ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className={`w-3 h-3 rounded-full ${step === 'location' ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                </div>

                {step === 'username' ? (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-4xl mb-3">👋</div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Welcome to Leverage!
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                Let's set up your profile. What should we call you?
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Username
                                </label>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleUsernameNext()}
                                    placeholder="Enter your username"
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                />
                            </div>

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}

                            <button
                                onClick={handleUsernameNext}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg"
                            >
                                Next →
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-center mb-6">
                            <div className="text-4xl mb-3">📍</div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Where are you located?
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                This helps us find traders near you.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Zip Code (optional - auto-fills city)
                                </label>
                                <input
                                    type="text"
                                    value={zipCode}
                                    onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                    placeholder="Enter zip code"
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        City
                                    </label>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="City"
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        State
                                    </label>
                                    <input
                                        type="text"
                                        value={state}
                                        onChange={(e) => setState(e.target.value)}
                                        placeholder="State"
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('username')}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                                >
                                    ← Back
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={isLoading}
                                    className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-violet-600 transition-all shadow-lg disabled:opacity-50"
                                >
                                    {isLoading ? 'Saving...' : 'Get Started! 🚀'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

// Hook to check if setup is needed - shows on mount, triggers walkthrough after
export const useNewUserSetup = () => {
    const { currentUser } = useAuth();
    const [showSetup, setShowSetup] = useState(false);
    const [setupComplete, setSetupComplete] = useState(false);

    // Check on mount if setup is needed
    useEffect(() => {
        const isComplete = localStorage.getItem(SETUP_COMPLETE_KEY);
        if (isComplete) {
            setSetupComplete(true);
        } else if (currentUser) {
            // If user already has profile data (name, city, state), they're an existing user
            // Mark as complete and don't show the modal or tour
            const hasProfileData = currentUser.name && currentUser.city && currentUser.state;
            if (hasProfileData) {
                localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
                localStorage.setItem('leverage_walkthrough_completed', 'true');
                setSetupComplete(true);
            } else {
                // Show setup modal for truly new users
                setShowSetup(true);
            }
        }
    }, [currentUser]);

    const completeSetup = () => {
        setShowSetup(false);
        setSetupComplete(true);
        localStorage.setItem(SETUP_COMPLETE_KEY, 'true');
        // Clear walkthrough so it shows after setup for new users
        localStorage.removeItem('leverage_walkthrough_completed');
    };

    return { showSetup, setupComplete, completeSetup };
};

export default NewUserSetupModal;
