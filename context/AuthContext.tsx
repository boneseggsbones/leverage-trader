import React, { createContext, useState, useContext, ReactNode } from 'react';
// Fix: Add .tsx extension to module imports
import { User } from '../types.ts';

interface AuthContextType {
    currentUser: User | null;
    login: (user: User) => void;
    logout: () => void;
    updateUser: (user: User) => void; // Add updateUser function
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const login = (user: User) => {
        setCurrentUser(user);
    };

    const logout = () => {
        setCurrentUser(null);
    };

    const updateUser = (user: User) => {
        setCurrentUser(user);
    };

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};