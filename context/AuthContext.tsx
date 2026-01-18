import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { User } from '../types.ts';

const API_URL = 'http://localhost:4000';

interface AuthContextType {
    currentUser: User | null;
    login: (user: User) => void;
    logout: () => void;
    updateUser: (user: User) => void;
    isLoading: boolean;
    oauthProfile: { email: string; name: string; image: string } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [oauthProfile, setOauthProfile] = useState<{ email: string; name: string; image: string } | null>(null);

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            // First check localStorage
            try {
                const raw = localStorage.getItem('leverage_currentUser');
                const oauthRaw = localStorage.getItem('leverage_oauthProfile');

                if (raw) {
                    const parsed = JSON.parse(raw) as any;
                    const normalized = {
                        ...parsed,
                        id: String(parsed.id),
                        inventory: Array.isArray(parsed.inventory)
                            ? parsed.inventory.map((it: any) => ({
                                ...it,
                                id: String(it.id),
                                ownerId: String(it.owner_id ?? it.ownerId ?? it.ownerId)
                            }))
                            : [],
                        balance: Number(parsed.balance ?? parsed.cash ?? 0),
                    } as User;
                    setCurrentUser(normalized);

                    // Also restore OAuth profile
                    if (oauthRaw) {
                        setOauthProfile(JSON.parse(oauthRaw));
                    }

                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                // Ignore localStorage errors
            }

            // Check for OAuth session
            try {
                const resp = await fetch(`${API_URL}/api/session`, {
                    credentials: 'include'
                });
                const data = await resp.json();
                if (data.user) {
                    const user = {
                        ...data.user,
                        id: String(data.user.id),
                        // Add OAuth profile image as avatar
                        avatar: data.oauthUser?.image || data.user.avatar || null,
                        inventory: Array.isArray(data.user.inventory)
                            ? data.user.inventory.map((it: any) => ({
                                ...it,
                                id: String(it.id),
                                ownerId: String(it.owner_id ?? it.ownerId)
                            }))
                            : [],
                    } as User;
                    setCurrentUser(user);
                    setOauthProfile(data.oauthUser || null);
                    localStorage.setItem('leverage_currentUser', JSON.stringify(user));
                    // Also persist OAuth profile for avatar
                    if (data.oauthUser) {
                        localStorage.setItem('leverage_oauthProfile', JSON.stringify(data.oauthUser));
                    }
                }
            } catch (e) {
                console.error('Failed to check OAuth session:', e);
            }

            setIsLoading(false);
        };

        checkSession();
    }, []);

    const login = (user: User) => {
        const toStore = {
            ...user,
            id: String(user.id),
            inventory: Array.isArray(user.inventory)
                ? user.inventory.map(i => ({
                    ...i,
                    id: String(i.id),
                    ownerId: String((i as any).owner_id ?? i.ownerId ?? i.ownerId)
                }))
                : []
        };
        setCurrentUser(toStore as User);
        try { localStorage.setItem('leverage_currentUser', JSON.stringify(toStore)); } catch (e) { }
    };

    const logout = async () => {
        setCurrentUser(null);
        setOauthProfile(null);
        try { localStorage.removeItem('leverage_currentUser'); } catch (e) { }

        // Also sign out from Auth.js
        try {
            await fetch(`${API_URL}/api/auth/signout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {
            // Ignore errors
        }
    };

    const updateUser = (user: User) => {
        const toStore = {
            ...user,
            id: String(user.id),
            inventory: Array.isArray(user.inventory)
                ? user.inventory.map(i => ({
                    ...i,
                    id: String(i.id),
                    ownerId: String((i as any).owner_id ?? i.ownerId ?? i.ownerId)
                }))
                : []
        };
        setCurrentUser(toStore as User);
        try { localStorage.setItem('leverage_currentUser', JSON.stringify(toStore)); } catch (e) { }
    };

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, updateUser, isLoading, oauthProfile }}>
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