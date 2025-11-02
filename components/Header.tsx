import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import UserMenuDropdown from './UserMenuDropdown.tsx';

const Header: React.FC = () => {
    const { currentUser } = useAuth();
    const { currentPage, navigateTo } = useNavigation();
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
        { page: 'dashboard', label: 'Discover' },
        { page: 'inventory', label: 'Inventory' },
        { page: 'trades', label: 'Trades' },
    ];

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    {/* Left side: Logo and main nav */}
                    <div className="flex items-center space-x-8">
                        <div className="flex-shrink-0">
                            <h1 className="text-2xl font-bold text-gray-800 cursor-pointer" onClick={() => navigateTo('dashboard')}>Leverage</h1>
                        </div>
                        <nav className="hidden md:flex space-x-4">
                            {navItems.map(item => (
                                <button
                                    key={item.page}
                                    onClick={() => navigateTo(item.page as any)}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        currentPage === item.page
                                            ? 'text-gray-900 bg-gray-100'
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Right side: User info and actions */}
                    <div className="flex items-center space-x-4">
                         <button onClick={() => navigateTo('start-trade')} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors hidden sm:block">
                            Start a New Trade
                        </button>
                        <div ref={menuRef} className="relative">
                            <button 
                                onClick={() => setIsMenuOpen(prev => !prev)}
                                className="flex items-center space-x-2 border border-gray-200 rounded-full p-1 pl-3 hover:shadow-md transition-shadow"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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