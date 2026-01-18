import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface NavItem {
    path: string;
    label: string;
    icon: string;
}

const MobileNavBar: React.FC = () => {
    const location = useLocation();

    const navItems: NavItem[] = [
        { path: '/', label: 'Discover', icon: '🔍' },
        { path: '/inventory', label: 'Inventory', icon: '📦' },
        { path: '/trades', label: 'Trades', icon: '🔄' },
        { path: '/analytics', label: 'Stats', icon: '📊' },
    ];

    // Don't show on login page
    if (location.pathname === '/login') return null;

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 pb-safe">
            <div className="flex justify-around items-center h-16">
                {navItems.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `
                            flex flex-col items-center justify-center flex-1 h-full py-2
                            transition-colors relative
                            ${isActive
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400'
                            }
                        `}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-blue-600 dark:bg-blue-400 rounded-b-full" />
                                )}
                                <span className="text-xl mb-0.5">{item.icon}</span>
                                <span className="text-xs font-medium">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default MobileNavBar;
