import React from 'react';
import { useNavigate } from 'react-router-dom';

interface EmptyStateProps {
    icon: string;
    title: string;
    description: string;
    actionLabel?: string;
    actionPath?: string;
    onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionLabel,
    actionPath,
    onAction
}) => {
    const navigate = useNavigate();

    const handleAction = () => {
        if (onAction) {
            onAction();
        } else if (actionPath) {
            navigate(actionPath);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in">
            <div className="text-6xl mb-4 animate-bounce">{icon}</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-6">{description}</p>
            {actionLabel && (actionPath || onAction) && (
                <button
                    onClick={handleAction}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors btn-press shadow-lg hover:shadow-xl"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};

// Pre-built empty states for common pages
export const EmptyInventory: React.FC<{ onAddItem?: () => void }> = ({ onAddItem }) => (
    <EmptyState
        icon="📦"
        title="Your Inventory is Empty"
        description="Add your first item to start trading with other collectors!"
        actionLabel="Add Your First Item"
        onAction={onAddItem}
    />
);

export const EmptyTrades: React.FC = () => (
    <EmptyState
        icon="🔄"
        title="No Active Trades"
        description="Find items you want and propose a trade to get started."
        actionLabel="Discover Items"
        actionPath="/"
    />
);

export const EmptyWishlist: React.FC = () => (
    <EmptyState
        icon="💝"
        title="Your Wishlist is Empty"
        description="Save items you're interested in by clicking the heart icon."
        actionLabel="Browse Items"
        actionPath="/"
    />
);

export const EmptyAnalytics: React.FC = () => (
    <EmptyState
        icon="📊"
        title="No Trading Data Yet"
        description="Complete some trades to see your analytics and performance metrics."
        actionLabel="Start Trading"
        actionPath="/start-trade"
    />
);

export const EmptySearch: React.FC<{ query?: string }> = ({ query }) => (
    <EmptyState
        icon="🔍"
        title="No Results Found"
        description={query ? `We couldn't find anything matching "${query}". Try a different search.` : "Try searching for something else."}
    />
);

export default EmptyState;
