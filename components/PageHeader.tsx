import React from 'react';

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    description: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

/**
 * A visually appealing page header component with title and description
 */
const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, description, icon, action }) => {
    return (
        <div className="mb-8 bg-gradient-to-r from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-6 border border-slate-200 dark:border-gray-600 shadow-sm transition-colors">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    {icon && (
                        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            {icon}
                        </div>
                    )}
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                                {title}
                            </h1>
                            {subtitle && (
                                <span className="px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                                    {subtitle}
                                </span>
                            )}
                        </div>
                        <p className="mt-2 text-slate-600 dark:text-gray-300 leading-relaxed max-w-2xl">
                            {description}
                        </p>
                    </div>
                </div>
                {action && (
                    <div className="flex-shrink-0 ml-4">
                        {action}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageHeader;
