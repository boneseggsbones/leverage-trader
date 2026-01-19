import React, { useState, useCallback } from 'react';
import { testSuite, Test } from '../tests/App.test.tsx';
import { allBackendTests, BackendTest, categoryMeta } from '../tests/backendApiTests';
import { useNavigate } from 'react-router-dom';

type TestResult = 'idle' | 'running' | 'passed' | 'failed';

interface TestState {
    name: string;
    result: TestResult;
    error: string | null;
    duration?: number;
}

const TestRunner: React.FC = () => {
    const navigate = useNavigate();
    const [testStates, setTestStates] = useState<TestState[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTab, setActiveTab] = useState<'frontend' | 'backend'>('frontend');
    const [backendProgress, setBackendProgress] = useState(0);
    const [runningBackend, setRunningBackend] = useState(false);
    const [backendResults, setBackendResults] = useState<Record<string, TestResult>>({});
    const [backendErrors, setBackendErrors] = useState<Record<string, string>>({});

    const runFrontendTests = useCallback(async () => {
        setIsRunning(true);
        setTestStates(testSuite.map(t => ({ name: t.name, result: 'idle', error: null })));

        for (let i = 0; i < testSuite.length; i++) {
            const test = testSuite[i];
            const testStart = Date.now();
            setTestStates(prev => {
                const newStates = [...prev];
                newStates[i] = { ...newStates[i], result: 'running' };
                return newStates;
            });
            try {
                await new Promise(res => setTimeout(res, 50));
                await test.run();
                setTestStates(prev => {
                    const newStates = [...prev];
                    newStates[i] = { ...newStates[i], result: 'passed', error: null, duration: Date.now() - testStart };
                    return newStates;
                });
            } catch (e: any) {
                setTestStates(prev => {
                    const newStates = [...prev];
                    newStates[i] = { ...newStates[i], result: 'failed', error: e.message, duration: Date.now() - testStart };
                    return newStates;
                });
            }
        }
        setIsRunning(false);
    }, []);

    const runBackendTests = useCallback(async () => {
        setRunningBackend(true);
        setBackendProgress(0);
        setBackendResults({});
        setBackendErrors({});

        const total = allBackendTests.length;
        let completed = 0;

        for (const test of allBackendTests) {
            setBackendResults(prev => ({ ...prev, [test.id]: 'running' }));
            try {
                await test.run();
                setBackendResults(prev => ({ ...prev, [test.id]: 'passed' }));
            } catch (error: any) {
                setBackendResults(prev => ({ ...prev, [test.id]: 'failed' }));
                setBackendErrors(prev => ({ ...prev, [test.id]: error.message }));
            }
            completed++;
            setBackendProgress(Math.round((completed / total) * 100));
        }
        setRunningBackend(false);
    }, []);

    const getIcon = (result: TestResult) => {
        if (result === 'passed') return <span className="text-green-400">✓</span>;
        if (result === 'failed') return <span className="text-red-400">✗</span>;
        if (result === 'running') return <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />;
        return <span className="text-gray-500">○</span>;
    };

    // Counts
    const frontendPassed = testStates.filter(t => t.result === 'passed').length;
    const frontendFailed = testStates.filter(t => t.result === 'failed').length;
    const backendPassed = Object.values(backendResults).filter(r => r === 'passed').length;
    const backendFailed = Object.values(backendResults).filter(r => r === 'failed').length;
    const totalPassed = frontendPassed + backendPassed;
    const totalFailed = frontendFailed + backendFailed;

    // Group backend tests by category
    const testsByCategory = allBackendTests.reduce((acc, test) => {
        if (!acc[test.category]) acc[test.category] = [];
        acc[test.category].push(test);
        return acc;
    }, {} as Record<string, BackendTest[]>);

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8" style={{ minHeight: '100vh', backgroundColor: '#030712' }}>
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-white">Test Suite</h1>
                    <button
                        onClick={() => navigate('/login')}
                        className="text-sm text-gray-400 hover:text-white"
                    >
                        ← Back
                    </button>
                </div>

                {/* Simple Stats Bar */}
                <div className="flex gap-6 mb-6 text-sm">
                    <div>
                        <span className="text-green-400 font-bold text-xl">{totalPassed}</span>
                        <span className="text-gray-500 ml-2">passed</span>
                    </div>
                    <div>
                        <span className="text-red-400 font-bold text-xl">{totalFailed}</span>
                        <span className="text-gray-500 ml-2">failed</span>
                    </div>
                    <div className="text-gray-600">|</div>
                    <div className="text-gray-400">
                        {testSuite.length} frontend • {allBackendTests.length} backend
                    </div>
                </div>

                {/* Tab Buttons */}
                <div className="flex gap-1 mb-4">
                    <button
                        onClick={() => setActiveTab('frontend')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'frontend'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        Frontend ({testSuite.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('backend')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'backend'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                            }`}
                    >
                        Backend ({allBackendTests.length})
                    </button>
                </div>

                {/* Frontend Panel */}
                {activeTab === 'frontend' && (
                    <div className="bg-gray-900 rounded-lg border border-gray-800">
                        <div className="p-4 border-b border-gray-800">
                            <button
                                onClick={runFrontendTests}
                                disabled={isRunning}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg font-medium transition"
                            >
                                {isRunning ? 'Running...' : '▶ Run Frontend Tests'}
                            </button>
                        </div>
                        <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
                            {(testStates.length === 0 ? testSuite.map(t => ({ name: t.name, result: 'idle' as TestResult, error: null, duration: undefined })) : testStates).map((state, i) => (
                                <div key={i} className={`p-3 rounded-lg border ${state.result === 'passed' ? 'border-green-800 bg-green-900/20' :
                                    state.result === 'failed' ? 'border-red-800 bg-red-900/20' :
                                        'border-gray-800 bg-gray-800/30'
                                    }`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-5">{getIcon(state.result)}</div>
                                        <span className="flex-1 text-sm">{state.name}</span>
                                        {state.duration && (
                                            <span className="text-xs text-gray-500">{state.duration}ms</span>
                                        )}
                                    </div>
                                    {state.error && (
                                        <pre className="mt-2 p-2 bg-red-950 text-red-300 text-xs rounded overflow-auto">
                                            {state.error}
                                        </pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Backend Panel */}
                {activeTab === 'backend' && (
                    <div className="bg-gray-900 rounded-lg border border-gray-800">
                        <div className="p-4 border-b border-gray-800">
                            <button
                                onClick={runBackendTests}
                                disabled={runningBackend}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded-lg font-medium transition"
                            >
                                {runningBackend ? `Running... ${backendProgress}%` : '▶ Run Backend Tests'}
                            </button>
                            {runningBackend && (
                                <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-500 transition-all"
                                        style={{ width: `${backendProgress}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
                            {Object.entries(testsByCategory).map(([category, tests]) => {
                                const meta = categoryMeta[category] || { icon: '🧪', color: 'from-gray-600 to-gray-700' };
                                const passed = tests.filter(t => backendResults[t.id] === 'passed').length;
                                return (
                                    <div key={category} className="border border-gray-800 rounded-lg overflow-hidden">
                                        <div className={`bg-gradient-to-r ${meta.color} px-4 py-2 flex items-center gap-2`}>
                                            <span>{meta.icon}</span>
                                            <span className="font-medium text-sm">{category}</span>
                                            <span className="ml-auto text-xs opacity-70">{passed}/{tests.length}</span>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            {tests.map(test => (
                                                <div key={test.id}>
                                                    <div className={`flex items-center gap-2 p-2 rounded text-sm ${backendResults[test.id] === 'passed' ? 'text-green-300' :
                                                        backendResults[test.id] === 'failed' ? 'text-red-300' :
                                                            'text-gray-500'
                                                        }`}>
                                                        <div className="w-4">{getIcon(backendResults[test.id] || 'idle')}</div>
                                                        <span>{test.name}</span>
                                                    </div>
                                                    {backendErrors[test.id] && (
                                                        <pre className="ml-6 p-2 bg-red-950 text-red-300 text-xs rounded">
                                                            {backendErrors[test.id]}
                                                        </pre>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TestRunner;