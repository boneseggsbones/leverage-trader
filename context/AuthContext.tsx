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
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        try {
            const raw = localStorage.getItem('leverage_currentUser');
            if (!raw) return null;
            const parsed = JSON.parse(raw) as any;
            // Lightweight normalization to ensure ids are strings and inventory items have string ids
            const normalized = {
                ...parsed,
                id: String(parsed.id),
                inventory: Array.isArray(parsed.inventory) ? parsed.inventory.map((it: any) => ({ ...it, id: String(it.id), ownerId: String(it.owner_id ?? it.ownerId ?? it.ownerId) })) : [],
                balance: Number(parsed.balance ?? parsed.cash ?? 0),
            } as User;
            return normalized;
        } catch (e) {
            return null;
        }
    });

    const login = (user: User) => {
        // Ensure we persist a normalized shape (ids as strings)
        const toStore = { ...user, id: String(user.id), inventory: Array.isArray(user.inventory) ? user.inventory.map(i => ({ ...i, id: String(i.id), ownerId: String((i as any).owner_id ?? i.ownerId ?? i.ownerId) })) : [] };
        setCurrentUser(toStore as User);
        try { localStorage.setItem('leverage_currentUser', JSON.stringify(toStore)); } catch (e) {}
    };

    const logout = () => {
        setCurrentUser(null);
        try { localStorage.removeItem('leverage_currentUser'); } catch (e) {}
    };

    const updateUser = (user: User) => {
        const toStore = { ...user, id: String(user.id), inventory: Array.isArray(user.inventory) ? user.inventory.map(i => ({ ...i, id: String(i.id), ownerId: String((i as any).owner_id ?? i.ownerId ?? i.ownerId) })) : [] };
        setCurrentUser(toStore as User);
        try { localStorage.setItem('leverage_currentUser', JSON.stringify(toStore)); } catch (e) {}
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