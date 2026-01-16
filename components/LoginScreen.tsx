
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
// Fix: Add .tsx extension to module imports
import { fetchAllUsers } from '../api/api';
import { User } from '../types.ts';

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
            const resp = await fetch('http://localhost:4000/api/login', {
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
            const resp = await fetch('http://localhost:4000/api/users', {
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

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-lg">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-800">Leverage</h1>
                    <p className="mt-2 text-slate-500">Select a user to begin trading</p>
                </div>

                {isLoading && <div className="text-center text-gray-500">Loading users...</div>}
                {error && <div className="text-center text-red-500">{error}</div>}
                
                <div className="space-y-4">
                    {/* Standardized login form */}
                    <div className="space-y-2">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email"
                            className="w-full p-3 border border-gray-200 rounded-md"
                        />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full p-3 border border-gray-200 rounded-md"
                        />
                        <div className="flex gap-2">
                            <button onClick={handleLogin} className="flex-1 px-4 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">Log in</button>
                            <button onClick={() => setShowCreate(prev => !prev)} className="px-4 py-3 text-lg font-semibold text-gray-700 bg-gray-100 rounded-lg">{showCreate ? 'Cancel' : 'Create'}</button>
                        </div>
                        {showCreate && (
                            <div className="pt-2">
                                <p className="text-sm text-slate-500">Creating an account will sign you in automatically.</p>
                                <button onClick={handleCreate} className="w-full mt-2 px-4 py-3 text-lg font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700">Create Account</button>
                            </div>
                        )}
                    </div>

                    {/* Quick demo logins */}
                    <div className="pt-4">
                        <p className="text-sm text-slate-500 mb-2">Or quick-login as a demo user:</p>
                        <div className="space-y-2">
                            {users.map((user) => (
                                <button
                                    key={user.id}
                                    onClick={() => { login(user); }}
                                    className="w-full px-4 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    Login as {user.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="text-center text-slate-500 text-sm pt-4 border-t border-gray-200">
                    <p>This is a demo application. All data is mocked.</p>
                     <button
                        onClick={() => navigate('/about')}
                        className="mt-2 font-semibold text-blue-600 hover:underline"
                    >
                        Learn about Leverage
                    </button>
                     <span className="mx-2">|</span>
                     <button
                        onClick={() => navigate('/test-runner')}
                        className="mt-2 font-semibold text-cyan-600 hover:underline"
                    >
                        Run Test Suite
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;