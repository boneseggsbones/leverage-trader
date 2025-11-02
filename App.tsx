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
import Header from './components/Header.tsx';
import InventoryPage from './components/InventoryPage.tsx';
import TradesPage from './components/TradesPage.tsx';
import StartTradePage from './components/StartTradePage.tsx';
import ProfilePage from './components/ProfilePage.tsx';
import WishlistPage from './components/WishlistPage.tsx';


const AuthenticatedApp: React.FC = () => {
    const { currentPage } = useNavigation();

    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <Dashboard />;
            case 'inventory':
                return <InventoryPage />;
            case 'trades':
                return <TradesPage />;
            case 'start-trade':
                return <StartTradePage />;
            case 'trade-desk':
                return <TradeDesk />;
            case 'trade-history':
                return <TradeHistory />;
            case 'about':
                return <AboutPage />;
            case 'test-runner':
                return <TestRunner />;
            case 'profile':
                return <ProfilePage />;
            case 'wishlist':
                return <WishlistPage />;
            default:
                return <Dashboard />; // Default to dashboard for logged-in users
        }
    };

    // TradeDesk has its own internal header/layout, so don't wrap it
    if (currentPage === 'trade-desk') {
        return renderPage();
    }

    return (
        <div className="min-h-screen bg-white">
            <Header />
            <main>
                {renderPage()}
            </main>
        </div>
    );
};


const AppRouter: React.FC = () => {
    const { currentUser } = useAuth();
    const { currentPage, navigateTo } = useNavigation();

    React.useEffect(() => {
        if (currentUser && currentPage === 'login') {
            navigateTo('dashboard');
        }
    }, [currentUser, currentPage, navigateTo]);

    if (!currentUser) {
        switch (currentPage) {
            case 'about':
                return <AboutPage />;
            case 'test-runner':
                return <TestRunner />;
            default:
                return <LoginScreen />;
        }
    }

    return <AuthenticatedApp />;
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