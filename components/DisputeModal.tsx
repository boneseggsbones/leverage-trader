import React, { useState } from 'react';
import { DisputeType } from '../types';

interface DisputeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (disputeType: DisputeType, statement: string) => void; 
    tradeId: string;
    isSubmitting: boolean;
}

const DisputeModal: React.FC<DisputeModalProps> = ({ isOpen, onClose, onSubmit, tradeId, isSubmitting }) => {
    const [disputeType, setDisputeType] = useState<DisputeType | ''>('');
    const [statement, setStatement] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!disputeType || !statement || isSubmitting) return;
        onSubmit(disputeType, statement);
    };

    if (!isOpen) return null;

    const isFormInvalid = !disputeType || statement.trim().length < 10;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg m-4 transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit}>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">File a Dispute</h3>
                    <p className="text-sm text-slate-500 mb-6">Trade ID: {tradeId}</p>

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="disputeType" className="block text-sm font-medium text-gray-700 mb-1">Reason for Dispute</label>
                            <select 
                                id="disputeType"
                                value={disputeType}
                                onChange={e => setDisputeType(e.target.value as DisputeType)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="" disabled>Select a reason...</option>
                                <option value="INR">Item Not Received</option>
                                <option value="SNAD">Significantly Not As Described</option>
                                <option value="COUNTERFEIT">Item is Counterfeit</option>
                                <option value="SHIPPING_DAMAGE">Item was Damaged in Shipping</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="statement" className="block text-sm font-medium text-gray-700 mb-1">Initial Statement</label>
                             <textarea 
                                id="statement"
                                value={statement}
                                onChange={e => setStatement(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                rows={5}
                                placeholder="Please describe the issue in detail. (Min. 10 characters)"
                                required
                                minLength={10}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={isFormInvalid || isSubmitting}
                            className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Dispute'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DisputeModal;