// Fix: Replaced placeholder content with a functional App component to set up providers and routing.
import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { NotificationProvider } from './context/NotificationContext';
// Fix: Add .tsx extension to component imports
import LoginScreen from './components/LoginScreen.tsx';
import Dashboard from './components/Dashboard.tsx';
import TradeDesk from './components/TradeDesk.tsx';
import TradeHistory from './components/TradeHistory.tsx';
import AboutPage from './components/AboutPage.tsx';
import TestRunner from './components/TestRunner.tsx';

// --- New, Deterministic Router Component ---
const AppRouter: React.FC = () => {
    const { currentUser } = useAuth();
    const { currentPage, navigateTo } = useNavigation();

    // This effect handles the initial login redirect. It's the only one needed.
    React.useEffect(() => {
        if (currentUser && currentPage === 'login') {
            navigateTo('dashboard');
        }
    }, [currentUser, currentPage, navigateTo]);

    // --- Synchronous Guard Clauses for Rendering ---

    // Guard 1: If user is logged out, only allow public pages.
    if (!currentUser) {
        switch (currentPage) {
            case 'about':
                return <AboutPage />;
            case 'test-runner':
                return <TestRunner />;
            // For any other page, including protected ones, render Login.
            default:
                return <LoginScreen />;
        }
    }

    // Guard 2: If user IS logged in, render the authenticated app.
    // The useEffect above handles redirecting them away from the login page.
    switch (currentPage) {
        case 'dashboard':
            return <Dashboard />;
        case 'trade-desk':
            return <TradeDesk />;
        case 'trade-history':
            return <TradeHistory />;
        case 'about':
            return <AboutPage />;
        case 'test-runner':
            return <TestRunner />;
        // If logged in and on an invalid or login page, the effect will redirect.
        // Render a loading state to prevent flashing.
        default:
            return <div className="min-h-screen bg-gray-50" />;
    }
};


const App: React.FC = () => {
    return (
        <NotificationProvider>
            <AuthProvider>
                <NavigationProvider>
                    <AppRouter />
                </NavigationProvider>
            </AuthProvider>
        </NotificationProvider>
    );
};

export default App;