import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface OnboardingModalProps {
    show: boolean;
    onClose: () => void;
}

const ONBOARDING_KEY = 'leverage_onboarding_completed';

const OnboardingModal: React.FC<OnboardingModalProps> = ({ show, onClose }) => {
    const [step, setStep] = useState(0);
    const navigate = useNavigate();

    const steps = [
        {
            icon: '👋',
            title: 'Welcome to Leverage!',
            description: 'The trusted platform for trading items with other collectors. Let\'s get you started in just a few steps.',
            action: null
        },
        {
            icon: '📦',
            title: 'Add Your First Item',
            description: 'Start by adding items you\'d like to trade. Include photos and estimated values to attract the best offers.',
            action: { label: 'Go to Inventory', path: '/inventory' }
        },
        {
            icon: '🔍',
            title: 'Discover Trades',
            description: 'Browse items from other traders on the Discover page. Find something you like? Start a trade!',
            action: { label: 'Explore Items', path: '/discover' }
        },
        {
            icon: '🔒',
            title: 'Trade Safely with Escrow',
            description: 'All trades are protected by our escrow system. Your items and payments are secure until both parties confirm delivery.',
            action: null
        }
    ];

    const handleComplete = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        onClose();
    };

    const handleAction = (path: string) => {
        handleComplete();
        navigate(path);
    };

    const nextStep = () => {
        if (step < steps.length - 1) {
            setStep(step + 1);
        } else {
            handleComplete();
        }
    };

    const prevStep = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    if (!show) return null;

    const currentStep = steps[step];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Progress dots */}
                <div className="flex justify-center gap-2 pt-6 pb-2">
                    {steps.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setStep(i)}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${i === step
                                    ? 'bg-blue-600 w-6'
                                    : i < step
                                        ? 'bg-blue-400 dark:bg-blue-500'
                                        : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                        />
                    ))}
                </div>

                {/* Content */}
                <div className="px-8 py-6 text-center">
                    <div className="text-6xl mb-4">{currentStep.icon}</div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                        {currentStep.title}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        {currentStep.description}
                    </p>
                </div>

                {/* Actions */}
                <div className="px-8 pb-8 space-y-3">
                    {currentStep.action && (
                        <button
                            onClick={() => handleAction(currentStep.action!.path)}
                            className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg transition-all transform hover:scale-[1.02]"
                        >
                            {currentStep.action.label}
                        </button>
                    )}

                    <div className="flex gap-3">
                        {step > 0 && (
                            <button
                                onClick={prevStep}
                                className="flex-1 py-3 px-6 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Back
                            </button>
                        )}
                        <button
                            onClick={nextStep}
                            className={`${step > 0 ? 'flex-1' : 'w-full'} py-3 px-6 ${step === steps.length - 1
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                } text-white font-semibold rounded-xl transition-colors`}
                        >
                            {step === steps.length - 1 ? 'Get Started!' : 'Next'}
                        </button>
                    </div>

                    {step === 0 && (
                        <button
                            onClick={handleComplete}
                            className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                        >
                            Skip tutorial
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export const useOnboarding = () => {
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        const completed = localStorage.getItem(ONBOARDING_KEY);
        if (!completed) {
            // Small delay to let the page load first
            const timer = setTimeout(() => setShowOnboarding(true), 500);
            return () => clearTimeout(timer);
        }
    }, []);

    const closeOnboarding = () => setShowOnboarding(false);

    return { showOnboarding, closeOnboarding };
};

export default OnboardingModal;
