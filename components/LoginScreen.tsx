
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

    const handleLogin = (user: User) => {
        login(user);
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
                    {users.map((user) => (
                        <button
                            key={user.id}
                            onClick={() => handleLogin(user)}
                            className="w-full px-4 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Login as {user.name}
                        </button>
                    ))}
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