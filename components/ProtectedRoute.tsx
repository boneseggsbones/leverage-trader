
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from './Header';

const ProtectedRoute: React.FC = () => {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    return (
        <div className="min-h-screen bg-white">
            <Header />
            <main>
                <Outlet />
            </main>
        </div>
    );
};

export default ProtectedRoute;
