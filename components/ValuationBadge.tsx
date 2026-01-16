import React from 'react';

interface ValuationBadgeProps {
    source: string | null | undefined;
    confidence?: number | null;
    size?: 'sm' | 'md';
}

const ValuationBadge: React.FC<ValuationBadgeProps> = ({ source, confidence, size = 'sm' }) => {
    const getSourceConfig = (src: string | null | undefined) => {
        switch (src) {
            case 'api':
            case 'API_VERIFIED':
                return {
                    label: 'API Verified',
                    bgColor: 'bg-blue-100',
                    textColor: 'text-blue-800',
                    icon: '🔷',
                };
            case 'user_override':
            case 'USER_DEFINED_UNIQUE':
                return {
                    label: 'User Defined',
                    bgColor: 'bg-yellow-100',
                    textColor: 'text-yellow-800',
                    icon: '📝',
                };
            case 'user_defined':
            case 'USER_DEFINED_GENERIC':
                return {
                    label: 'User Defined',
                    bgColor: 'bg-yellow-100',
                    textColor: 'text-yellow-800',
                    icon: '📝',
                };
            case 'trade_history':
                return {
                    label: 'Trade Verified',
                    bgColor: 'bg-green-100',
                    textColor: 'text-green-800',
                    icon: '📈',
                };
            case 'ai_estimate':
                return {
                    label: 'AI Estimate',
                    bgColor: 'bg-purple-100',
                    textColor: 'text-purple-800',
                    icon: '🤖',
                };
            default:
                return {
                    label: 'Unverified',
                    bgColor: 'bg-gray-100',
                    textColor: 'text-gray-600',
                    icon: '❓',
                };
        }
    };

    const config = getSourceConfig(source);
    const sizeClasses = size === 'sm'
        ? 'text-xs px-2 py-0.5'
        : 'text-sm px-3 py-1';

    return (
        <span className={`inline-flex items-center gap-1 rounded-full font-medium ${config.bgColor} ${config.textColor} ${sizeClasses}`}>
            <span>{config.icon}</span>
            <span>{config.label}</span>
            {confidence !== null && confidence !== undefined && (
                <span className="opacity-70">({confidence}%)</span>
            )}
        </span>
    );
};

export default ValuationBadge;
