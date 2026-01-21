import React, { useState } from 'react';

interface PSACertData {
    certNumber: string;
    grade: string;
    gradeDescription: string;
    qualifier?: string;
    labelType: string;
    year?: string;
    brand?: string;
    setName?: string;
    cardNumber?: string;
    subject?: string;
    variety?: string;
    population: number;
    populationHigher: number;
    verified: boolean;
}

interface PSALinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLink: (certNumber: string, certData: PSACertData) => void;
    itemId: number;
    itemName: string;
}

const PSALinkModal: React.FC<PSALinkModalProps> = ({
    isOpen,
    onClose,
    onLink,
    itemId,
    itemName
}) => {
    const [certNumber, setCertNumber] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verifiedData, setVerifiedData] = useState<PSACertData | null>(null);

    if (!isOpen) return null;

    const handleVerify = async () => {
        if (!certNumber || certNumber.length < 5) {
            setError('Please enter a valid PSA cert number');
            return;
        }

        setIsLoading(true);
        setError(null);
        setVerifiedData(null);

        try {
            const response = await fetch(`http://localhost:4000/api/psa/verify/${certNumber}`);
            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Certification not found');
                return;
            }

            setVerifiedData(data);
        } catch (err) {
            setError('Failed to verify certification. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLink = async () => {
        if (!verifiedData) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`http://localhost:4000/api/items/${itemId}/link-psa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ certNumber }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to link certification');
                return;
            }

            onLink(certNumber, verifiedData);
            onClose();
        } catch (err) {
            setError('Failed to link certification. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setCertNumber('');
        setVerifiedData(null);
        setError(null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🏆</span>
                            <div>
                                <h2 className="text-lg font-bold text-white">Link PSA Certification</h2>
                                <p className="text-red-100 text-sm truncate max-w-[200px]">{itemName}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {!verifiedData ? (
                        <>
                            {/* Cert Number Input */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    PSA Cert Number
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={certNumber}
                                        onChange={(e) => setCertNumber(e.target.value.replace(/\D/g, ''))}
                                        placeholder="e.g., 46789123"
                                        className="flex-1 px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-lg font-mono"
                                        maxLength={12}
                                    />
                                    <button
                                        onClick={handleVerify}
                                        disabled={isLoading || certNumber.length < 5}
                                        className="px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {isLoading ? '...' : 'Verify'}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Enter the cert number found on your PSA label
                                </p>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Verified Data Display */}
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-green-600 text-lg">✓</span>
                                    <span className="font-semibold text-green-700">Certification Verified</span>
                                </div>

                                {/* Grade Badge */}
                                <div className="flex items-center justify-center mb-4">
                                    <div className="bg-gradient-to-br from-red-500 to-red-600 text-white px-6 py-3 rounded-xl">
                                        <div className="text-3xl font-bold text-center">
                                            PSA {verifiedData.grade}
                                        </div>
                                        <div className="text-sm text-red-100 text-center">
                                            {verifiedData.gradeDescription}
                                        </div>
                                    </div>
                                </div>

                                {/* Card Details */}
                                <div className="space-y-2 text-sm">
                                    {verifiedData.subject && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Subject</span>
                                            <span className="font-medium text-slate-700">{verifiedData.subject}</span>
                                        </div>
                                    )}
                                    {verifiedData.setName && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Set</span>
                                            <span className="font-medium text-slate-700">{verifiedData.setName}</span>
                                        </div>
                                    )}
                                    {verifiedData.year && (
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Year</span>
                                            <span className="font-medium text-slate-700">{verifiedData.year}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Population</span>
                                        <span className="font-medium text-slate-700">
                                            {verifiedData.population.toLocaleString()}
                                            {verifiedData.populationHigher === 0 && (
                                                <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                    Top Pop!
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Cert #</span>
                                        <span className="font-mono text-slate-700">{verifiedData.certNumber}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleReset}
                                    className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
                                >
                                    Try Different
                                </button>
                                <button
                                    onClick={handleLink}
                                    disabled={isLoading}
                                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 transition-all"
                                >
                                    {isLoading ? 'Linking...' : 'Link to Item'}
                                </button>
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mt-4">
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PSALinkModal;
