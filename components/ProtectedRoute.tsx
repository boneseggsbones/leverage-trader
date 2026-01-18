
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import MobileNavBar from './MobileNavBar';

const ProtectedRoute: React.FC = () => {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
            <Header />
            <main className="pb-20 md:pb-0">
                <Outlet />
            </main>
            <MobileNavBar />
        </div>
    );
};

export default ProtectedRoute;
