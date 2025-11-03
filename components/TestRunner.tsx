import React, { useState, useCallback } from 'react';
// Import the test suite from its dedicated file
// Fix: Add .tsx extension to module imports
import { testSuite, Test } from '../tests/App.test.tsx';
import { useNavigation } from '../context/NavigationContext';

type TestResult = 'idle' | 'running' | 'passed' | 'failed';

interface TestState {
    name: string;
    result: TestResult;
    error: string | null;
}

const TestRunner: React.FC = () => {
    const { navigateTo } = useNavigation();
    const [testStates, setTestStates] = useState<TestState[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const runAllTests = useCallback(async () => {
        setIsRunning(true);
        // Initialize state from the imported test suite
        setTestStates(testSuite.map(t => ({ name: t.name, result: 'idle', error: null })));
    
        for (let i = 0; i < testSuite.length; i++) {
            const test = testSuite[i];
            setTestStates(prev => {
                const newStates = [...prev];
                newStates[i] = { ...newStates[i], result: 'running' };
                return newStates;
            });
            try {
                // Introduce a small delay for visual feedback
                await new Promise(res => setTimeout(res, 50));
                await test.run();
                setTestStates(prev => {
                    const newStates = [...prev];
                    newStates[i] = { ...newStates[i], result: 'passed', error: null };
                    return newStates;
                });
            } catch (e: any) {
                setTestStates(prev => {
                    const newStates = [...prev];
                    newStates[i] = { ...newStates[i], result: 'failed', error: e.message };
                    return newStates;
                });
            }
        }
        setIsRunning(false);
    }, []);

    const getResultIcon = (result: TestResult) => {
        switch (result) {
            case 'passed': return <span className="text-green-500">✓</span>;
            case 'failed': return <span className="text-red-500">✗</span>;
            case 'running': return <div className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>;
            default: return <span className="text-gray-400">○</span>;
        }
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen p-8 font-mono">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-cyan-400">Leverage Test Runner</h1>
                    <button
                        onClick={() => navigateTo('login')}
                        className="px-4 py-2 text-sm font-semibold text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-md transition-colors"
                    >
                        Back to Login
                    </button>
                </div>
                
                <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                    <button
                        onClick={runAllTests}
                        disabled={isRunning}
                        className="w-full px-6 py-3 text-lg font-bold bg-cyan-500 hover:bg-cyan-600 rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isRunning ? 'Running Tests...' : 'Run All Tests'}
                    </button>
                    
                    <div className="mt-6 space-y-3">
                        {testStates.length === 0 && <p className="text-center text-gray-400">Click "Run All Tests" to start.</p>}
                        {testStates.map((state, index) => (
                            <div key={index} className="bg-gray-700 p-4 rounded-md">
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 flex items-center justify-center text-xl text-center">{getResultIcon(state.result)}</div>
                                    <p className="flex-grow">{state.name}</p>
                                </div>
                                {state.result === 'failed' && state.error && (
                                    <pre className="mt-2 p-3 bg-red-900/50 text-red-300 rounded-md text-sm whitespace-pre-wrap break-all">
                                        {state.error}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TestRunner;