
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchAllUsers } from '../api/api';
import { User } from '../types.ts';

const API_URL = 'http://localhost:4000';

const LoginScreen: React.FC = () => {
    const { login, currentUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const fetchedUsers = await fetchAllUsers();
                setUsers(fetchedUsers);
            } catch (err) {
                setError('Failed to load users. Please try again later.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadUsers();
    }, []);

    useEffect(() => {
        if (currentUser) {
            navigate('/');
        }
    }, [currentUser, navigate]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const handleLogin = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!resp.ok) {
                const txt = await resp.text();
                setError(`Login failed: ${txt}`);
                return;
            }
            const user = await resp.json();
            login(user);
        } catch (err) {
            setError('Login failed.');
            console.error(err);
        }
    };

    const handleCreate = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: email.split('@')[0] || email, email, password }),
            });
            if (!resp.ok) {
                const txt = await resp.text();
                setError(`Create failed: ${txt}`);
                return;
            }
            const user = await resp.json();
            login(user);
        } catch (err) {
            setError('Create failed.');
            console.error(err);
        }
    };

    const handleGoogleSignIn = async () => {
        // Auth.js requires fetching CSRF token first, then posting to signin
        try {
            // Get CSRF token
            const csrfRes = await fetch(`${API_URL}/api/auth/csrf`, {
                credentials: 'include'
            });
            const { csrfToken } = await csrfRes.json();

            // Create form and submit to trigger OAuth redirect
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `${API_URL}/api/auth/signin/google`;

            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfToken';
            csrfInput.value = csrfToken;
            form.appendChild(csrfInput);

            const callbackInput = document.createElement('input');
            callbackInput.type = 'hidden';
            callbackInput.name = 'callbackUrl';
            callbackInput.value = 'http://localhost:3000/';
            form.appendChild(callbackInput);

            document.body.appendChild(form);
            form.submit();
        } catch (err) {
            console.error('Failed to start Google sign-in:', err);
            setError('Failed to start sign-in. Please try again.');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
            <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-800 dark:text-white">Leverage</h1>
                    <p className="mt-2 text-slate-500 dark:text-gray-400">Trade collectibles with confidence</p>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* SSO Button */}
                <div className="space-y-3">
                    <button
                        onClick={handleGoogleSignIn}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-gray-700 dark:text-white"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        Continue with Google
                    </button>
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">or continue with email</span>
                    </div>
                </div>

                {/* Email/Password Form */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email"
                            className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleLogin}
                                className="flex-1 px-4 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                            >
                                Log in
                            </button>
                            <button
                                onClick={() => setShowCreate(prev => !prev)}
                                className="px-4 py-3 text-lg font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                {showCreate ? 'Cancel' : 'Create'}
                            </button>
                        </div>
                        {showCreate && (
                            <div className="pt-2">
                                <p className="text-sm text-slate-500 dark:text-gray-400">Creating an account will sign you in automatically.</p>
                                <button
                                    onClick={handleCreate}
                                    className="w-full mt-2 px-4 py-3 text-lg font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-md"
                                >
                                    Create Account
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Demo Users */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">Quick demo login:</p>
                    <div className="flex flex-wrap gap-2">
                        {isLoading ? (
                            <div className="text-sm text-gray-400">Loading...</div>
                        ) : (
                            users.slice(0, 3).map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => login(user)}
                                    className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                    {user.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <div className="text-center text-slate-500 dark:text-gray-400 text-xs pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p>This is a demo application.</p>
                    <div className="mt-2 flex justify-center gap-4">
                        <button
                            onClick={() => navigate('/about')}
                            className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            About
                        </button>
                        <button
                            onClick={() => navigate('/test-runner')}
                            className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
                        >
                            Test Suite
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;