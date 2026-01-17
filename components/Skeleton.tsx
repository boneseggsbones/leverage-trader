import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'card';
    width?: string;
    height?: string;
    count?: number;
}

const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rectangular',
    width,
    height,
    count = 1
}) => {
    const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700';

    const variantClasses = {
        text: 'h-4 rounded',
        circular: 'rounded-full',
        rectangular: 'rounded-md',
        card: 'rounded-lg',
    };

    const style: React.CSSProperties = {};
    if (width) style.width = width;
    if (height) style.height = height;

    const skeletons = Array(count).fill(null).map((_, i) => (
        <div
            key={i}
            className={`${baseClass} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    ));

    return count === 1 ? skeletons[0] : <>{skeletons}</>;
};

// Pre-built skeleton layouts
export const ItemCardSkeleton: React.FC = () => (
    <div className="border-2 rounded-lg p-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Skeleton variant="rectangular" className="w-full h-24 mb-2" />
        <Skeleton variant="text" className="w-3/4 mb-1" />
        <Skeleton variant="text" className="w-1/2" />
        <div className="flex justify-around mt-2 gap-1">
            <Skeleton variant="text" className="w-12" />
            <Skeleton variant="text" className="w-12" />
        </div>
    </div>
);

export const TradeCardSkeleton: React.FC = () => (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
                <Skeleton variant="text" className="w-32 h-5 mb-2" />
                <Skeleton variant="text" className="w-24 h-3" />
            </div>
            <Skeleton variant="rectangular" className="w-24 h-6 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
            <div>
                <Skeleton variant="text" className="w-16 h-4 mb-2" />
                <Skeleton variant="rectangular" className="w-full h-16" />
            </div>
            <div>
                <Skeleton variant="text" className="w-16 h-4 mb-2" />
                <Skeleton variant="rectangular" className="w-full h-16" />
            </div>
        </div>
    </div>
);

export const TraderCardSkeleton: React.FC = () => (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <Skeleton variant="text" className="w-24 h-6 mb-4" />
        <div className="space-y-2">
            <div className="flex justify-between">
                <Skeleton variant="text" className="w-12" />
                <Skeleton variant="text" className="w-8" />
            </div>
            <div className="flex justify-between">
                <Skeleton variant="text" className="w-16" />
                <Skeleton variant="text" className="w-8" />
            </div>
        </div>
        <Skeleton variant="rectangular" className="w-full h-10 mt-6" />
    </div>
);

export const DiscoveryCardSkeleton: React.FC = () => (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <Skeleton variant="rectangular" className="h-40 w-full" />
        <div className="p-4">
            <Skeleton variant="text" className="w-3/4 h-5 mb-2" />
            <Skeleton variant="text" className="w-1/2 h-4" />
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Skeleton variant="text" className="w-12 h-3 mb-2" />
                <div className="flex justify-between">
                    <Skeleton variant="text" className="w-20" />
                    <Skeleton variant="text" className="w-16" />
                </div>
            </div>
        </div>
    </div>
);

export default Skeleton;
