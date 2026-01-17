
import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes';

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <NotificationProvider>
                <AuthProvider>
                    <AppRoutes />
                </AuthProvider>
            </NotificationProvider>
        </ThemeProvider>
    );
};

export default App;