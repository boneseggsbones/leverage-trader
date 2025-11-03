
import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import AppRoutes from './routes';

const App: React.FC = () => {
    return (
        <NotificationProvider>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </NotificationProvider>
    );
};

export default App;