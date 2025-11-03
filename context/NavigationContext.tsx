import React, { createContext, useState, useContext, ReactNode } from 'react';

// Fix: Define Page type to include all possible pages.
type Page = 'login' | 'dashboard' | 'inventory' | 'trades' | 'start-trade' | 'trade-desk' | 'trade-history' | 'about' | 'test-runner' | 'profile' | 'wishlist';

interface AppContext {
    otherUserId?: string;
    userId?: string;
}

interface NavigationContextType {
    currentPage: Page;
    pageContext: AppContext | null;
    navigateTo: (page: Page, context?: AppContext) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Fix: Implement the NavigationProvider to supply navigation state and functions.
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentPage, setCurrentPage] = useState<Page>('login');
    const [pageContext, setPageContext] = useState<AppContext | null>(null);

    const navigateTo = (page: Page, context: AppContext = {}) => {
        setCurrentPage(page);
        setPageContext(context);
    };

    return (
        <NavigationContext.Provider value={{ currentPage, navigateTo, pageContext }}>
            {children}
        </NavigationContext.Provider>
    );
};

export const useNavigation = () => {
    const context = useContext(NavigationContext);
    if (context === undefined) {
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
};