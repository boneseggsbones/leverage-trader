
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, NavLink } from 'react-router-dom';
import UserMenuDropdown from './UserMenuDropdown.tsx';
import ThemeToggle from './ThemeToggle.tsx';

const Header: React.FC = () => {
    const { currentUser } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    if (!currentUser) return null;

    const navItems = [
        { path: '/', label: 'Discover' },
        { path: '/inventory', label: 'Inventory' },
        { path: '/trades', label: 'Trades' },
        { path: '/analytics', label: 'Analytics' },
    ];

    return (
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-20 transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Left side: Logo and main nav */}
                    <div className="flex items-center space-x-8">
                        <div className="flex-shrink-0">
                            <Link to="/" className="text-2xl font-bold text-gray-800 dark:text-white">Leverage</Link>
                        </div>
                        <nav className="hidden md:flex space-x-4">
                            {navItems.map(item => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                                            ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700'
                                            : 'text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`
                                    }
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    {/* Right side: User info and actions */}
                    <div className="flex items-center space-x-4">
                        <ThemeToggle />
                        <Link to="/start-trade" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors hidden sm:block">
                            Start a New Trade
                        </Link>
                        <div ref={menuRef} className="relative">
                            <button
                                onClick={() => setIsMenuOpen(prev => !prev)}
                                className="flex items-center space-x-2 border border-gray-200 dark:border-gray-600 rounded-full p-1 pl-3 hover:shadow-md transition-shadow bg-white dark:bg-gray-700"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                <img
                                    src={currentUser.profilePictureUrl}
                                    alt={currentUser.name}
                                    className="h-8 w-8 rounded-full"
                                />
                            </button>
                            {isMenuOpen && <UserMenuDropdown onClose={() => setIsMenuOpen(false)} />}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;