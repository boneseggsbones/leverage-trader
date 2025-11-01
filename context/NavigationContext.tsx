import React, { createContext, useState, useContext, ReactNode } from 'react';

// Fix: Define Page type to include all possible pages.
type Page = 'login' | 'dashboard' | 'trade-desk' | 'trade-history' | 'about' | 'test-runner';

interface TradeContext {
    otherUserId: string;
}

interface NavigationContextType {
    currentPage: Page;
    tradeContext: TradeContext | null;
    navigateTo: (page: Page, context?: any) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

// Fix: Implement the NavigationProvider to supply navigation state and functions.
export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentPage, setCurrentPage] = useState<Page>('login');
    const [tradeContext, setTradeContext] = useState<TradeContext | null>(null);

    const navigateTo = (page: Page, context: any = null) => {
        setCurrentPage(page);
        if (page === 'trade-desk' && context?.otherUserId) {
            setTradeContext(context);
        } else {
            setTradeContext(null);
        }
    };

    return (
        <NavigationContext.Provider value={{ currentPage, navigateTo, tradeContext }}>
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