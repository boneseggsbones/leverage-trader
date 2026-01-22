import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface WalkthroughStep {
    targetId: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
    {
        targetId: 'header-nav',
        title: '🧭 Navigation',
        description: 'These tabs take you to Discover, Inventory, Trades, and Analytics. The bell shows notifications and the button starts a new trade!',
        position: 'bottom'
    },
    {
        targetId: 'discover-section',
        title: '🔍 Discover Items',
        description: 'Browse items from traders in your area. Search by name or category to find exactly what you want!',
        position: 'bottom'
    },
    {
        targetId: 'nearby-finds',
        title: '📍 Nearby Finds',
        description: 'These are items close to you! We show items from collectors in your city first.',
        position: 'bottom'
    },
    {
        targetId: 'wishlist-matches',
        title: '🔥 Hot Trade Matches',
        description: 'When someone wants YOUR items AND has items YOU want — you\'ll see them here. It\'s the double coincidence of wants, solved!',
        position: 'top'
    },
    {
        targetId: 'trade-matches',
        title: '🤝 Trade Matches',
        description: 'These traders have items that complement your collection. Click "Explore" to see what they\'ve got.',
        position: 'top'
    }
];

const STORAGE_KEY = 'leverage_walkthrough_completed';

interface OnboardingWalkthroughProps {
    onComplete?: () => void;
}

const OnboardingWalkthrough: React.FC<OnboardingWalkthroughProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const [arrowPosition, setArrowPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('top');

    // Check if walkthrough should be shown
    useEffect(() => {
        const completed = localStorage.getItem(STORAGE_KEY);
        if (!completed) {
            // Small delay to let dashboard render
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    // Position the tooltip relative to the target element
    const positionTooltip = useCallback(() => {
        if (!isVisible || currentStep >= WALKTHROUGH_STEPS.length) return;

        const step = WALKTHROUGH_STEPS[currentStep];
        const target = document.getElementById(step.targetId);

        if (!target) {
            // If target not found, skip to next step
            if (currentStep < WALKTHROUGH_STEPS.length - 1) {
                setCurrentStep(prev => prev + 1);
            }
            return;
        }

        const rect = target.getBoundingClientRect();
        const tooltipWidth = 320;
        const tooltipHeight = 180;
        const padding = 16;

        let top = 0;
        let left = 0;
        let arrow: 'top' | 'bottom' | 'left' | 'right' = step.position || 'bottom';

        switch (arrow) {
            case 'bottom':
                top = rect.bottom + padding;
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                break;
            case 'top':
                top = rect.top - tooltipHeight - padding;
                left = rect.left + rect.width / 2 - tooltipWidth / 2;
                break;
            case 'left':
                top = rect.top + rect.height / 2 - tooltipHeight / 2;
                left = rect.left - tooltipWidth - padding;
                break;
            case 'right':
                top = rect.top + rect.height / 2 - tooltipHeight / 2;
                left = rect.right + padding;
                break;
        }

        // Keep tooltip in viewport
        left = Math.max(padding, Math.min(left, window.innerWidth - tooltipWidth - padding));
        top = Math.max(padding, Math.min(top, window.innerHeight - tooltipHeight - padding));

        setTooltipPosition({ top, left });
        setArrowPosition(arrow);

        // Scroll target into view if needed
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight the target
        target.classList.add('walkthrough-highlight');
        return () => target.classList.remove('walkthrough-highlight');
    }, [currentStep, isVisible]);

    useEffect(() => {
        positionTooltip();
        window.addEventListener('resize', positionTooltip);
        window.addEventListener('scroll', positionTooltip);
        return () => {
            window.removeEventListener('resize', positionTooltip);
            window.removeEventListener('scroll', positionTooltip);
        };
    }, [positionTooltip]);

    // Remove highlight from previous step
    useEffect(() => {
        WALKTHROUGH_STEPS.forEach((step, index) => {
            const el = document.getElementById(step.targetId);
            if (el) {
                if (index === currentStep) {
                    el.classList.add('walkthrough-highlight');
                } else {
                    el.classList.remove('walkthrough-highlight');
                }
            }
        });
    }, [currentStep]);

    const handleNext = () => {
        if (currentStep < WALKTHROUGH_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            completeWalkthrough();
        }
    };

    const handleSkip = () => {
        completeWalkthrough();
    };

    const completeWalkthrough = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setIsVisible(false);
        // Remove all highlights
        WALKTHROUGH_STEPS.forEach(step => {
            document.getElementById(step.targetId)?.classList.remove('walkthrough-highlight');
        });
        onComplete?.();
    };

    if (!isVisible || currentStep >= WALKTHROUGH_STEPS.length) return null;

    const step = WALKTHROUGH_STEPS[currentStep];
    const isLastStep = currentStep === WALKTHROUGH_STEPS.length - 1;

    const tooltip = (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-[9998] transition-opacity duration-300"
                onClick={handleSkip}
            />

            {/* Tooltip */}
            <div
                className="fixed z-[9999] w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 transition-all duration-300 animate-fade-in"
                style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
            >
                {/* Arrow - points toward the target */}
                {/* When position is 'bottom', tooltip is below target, so arrow goes at TOP pointing up */}
                {/* When position is 'top', tooltip is above target, so arrow goes at BOTTOM pointing down */}
                <div
                    className={`absolute w-4 h-4 bg-white dark:bg-gray-800 transform rotate-45 ${arrowPosition === 'bottom' ? '-top-2 left-1/2 -translate-x-1/2' :
                            arrowPosition === 'top' ? '-bottom-2 left-1/2 -translate-x-1/2' :
                                arrowPosition === 'right' ? 'top-1/2 -left-2 -translate-y-1/2' :
                                    'top-1/2 -right-2 -translate-y-1/2'
                        }`}
                />

                {/* Content */}
                <div className="relative">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                        {step.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4">
                        {step.description}
                    </p>

                    {/* Progress dots */}
                    <div className="flex items-center justify-center gap-2 mb-4">
                        {WALKTHROUGH_STEPS.map((_, index) => (
                            <div
                                key={index}
                                className={`w-2 h-2 rounded-full transition-colors ${index === currentStep
                                    ? 'bg-indigo-500'
                                    : index < currentStep
                                        ? 'bg-indigo-300'
                                        : 'bg-gray-300 dark:bg-gray-600'
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleSkip}
                            className="flex-1 px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                            Skip tour
                        </button>
                        <button
                            onClick={handleNext}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-violet-600 transition-all shadow-md"
                        >
                            {isLastStep ? 'Get Started!' : 'Next →'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );

    return createPortal(tooltip, document.body);
};

export default OnboardingWalkthrough;
