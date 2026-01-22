
import { Routes, Route } from 'react-router-dom';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import TradeDesk from './components/TradeDesk';
import TradeHistory from './components/TradeHistory';
import AboutPage from './components/AboutPage';
import TestRunner from './components/TestRunner';
import InventoryPage from './components/InventoryPage';
import TradesPage from './components/TradesPage';
import StartTradePage from './components/StartTradePage';
import ProfilePage from './components/ProfilePage';
import WishlistPage from './components/WishlistPage';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AdminDashboard from './components/AdminDashboard';
import EbayImport from './components/EbayImport';
import ProtectedRoute from './components/ProtectedRoute';
import DatabaseVisualizer from './src/components/DatabaseVisualizer';
import LandingPage from './components/LandingPage';
import { useAuth } from './context/AuthContext';

const AppRoutes = () => {
    const { currentUser } = useAuth();

    return (
        <Routes>
            {/* Landing page for logged-out users at root */}
            <Route path="/" element={currentUser ? <Dashboard /> : <LandingPage />} />

            <Route path="/login" element={<LoginScreen />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/test-runner" element={<TestRunner />} />
            <Route path="/database" element={<DatabaseVisualizer />} />

            <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/trades" element={<TradesPage />} />
                <Route path="/start-trade" element={<StartTradePage />} />
                <Route path="/trade-desk/:otherUserId" element={<TradeDesk />} />
                <Route path="/trade-history" element={<TradeHistory />} />
                <Route path="/profile/:userId" element={<ProfilePage />} />
                <Route path="/wishlist" element={<WishlistPage />} />
                <Route path="/analytics" element={<AnalyticsDashboard />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/import/ebay" element={<EbayImport />} />
            </Route>
        </Routes>
    );
};

export default AppRoutes;
