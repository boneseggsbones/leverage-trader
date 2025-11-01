import React, { useState } from 'react';
import { DisputeTicket, User, DisputeResolution } from '../types';

interface DisputeResolutionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (resolution: DisputeResolution, moderatorNotes: string) => void;
    disputeTicket: DisputeTicket | null;
    users: User[];
    isSubmitting: boolean;
}

const DisputeResolutionModal: React.FC<DisputeResolutionModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    disputeTicket,
    users,
    isSubmitting
}) => {
    const [resolution, setResolution] = useState<DisputeResolution | ''>('');
    const [moderatorNotes, setModeratorNotes] = useState('');

    if (!isOpen || !disputeTicket) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!resolution || moderatorNotes.trim().length < 10 || isSubmitting) return;
        onSubmit(resolution, moderatorNotes);
    };

    const initiator = users.find(u => u.id === disputeTicket.initiatorId);
    const respondent = users.find(u => u.id !== disputeTicket.initiatorId);

    const EvidencePanel: React.FC<{ title: string; evidence: { statement: string; attachments: string[] } | null; user: User | undefined }> = ({ title, evidence, user }) => {
        if (!evidence) return <p className="text-sm text-gray-500 italic">{user?.name} did not provide a statement.</p>;
        return (
            <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-800">{title} ({user?.name}):</h4>
                <p className="text-sm text-gray-600 italic bg-gray-50 p-2 rounded-md my-1">"{evidence.statement}"</p>
                {evidence.attachments.length > 0 && (
                    <ul className="text-xs list-disc list-inside pl-2">
                        {evidence.attachments.map((file, i) => <li key={i}>{file}</li>)}
                    </ul>
                )}
            </div>
        );
    };

    const isFormInvalid = !resolution || moderatorNotes.trim().length < 10;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-3xl m-4 transform transition-all flex flex-col"
                style={{ height: 'clamp(500px, 90vh, 800px)' }}
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-slate-800">Moderator Resolution Panel</h3>
                    <p className="text-sm text-slate-500">Dispute ID: {disputeTicket.id}</p>
                </header>

                <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                    {/* Left Column: Evidence */}
                    <div className="border-r border-gray-200 pr-4 space-y-4">
                        <h3 className="text-lg font-bold text-gray-700 border-b pb-2">Case Evidence</h3>
                        <EvidencePanel title="Initiator's Claim" evidence={disputeTicket.initiatorEvidence} user={initiator} />
                        <EvidencePanel title="Respondent's Statement" evidence={disputeTicket.respondentEvidence} user={respondent} />
                        
                        <h3 className="text-lg font-bold text-gray-700 border-b pb-2 mt-4">Mediation Log</h3>
                        <div className="space-y-2 text-sm max-h-48 overflow-y-auto bg-gray-50 p-2 rounded-md">
                            {disputeTicket.mediationLog.length > 0 ? disputeTicket.mediationLog.map(msg => (
                                <div key={msg.id}>
                                    <span className="font-semibold">{users.find(u => u.id === msg.senderId)?.name}:</span> {msg.text}
                                </div>
                            )) : <p className="text-gray-500 italic">No mediation messages were exchanged.</p>}
                        </div>
                    </div>

                    {/* Right Column: Moderator Action */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                         <h3 className="text-lg font-bold text-gray-700 border-b pb-2">Final Ruling</h3>
                         <div>
                            <label htmlFor="resolution" className="block text-sm font-medium text-gray-700 mb-1">Resolution</label>
                            <select 
                                id="resolution"
                                value={resolution}
                                onChange={e => setResolution(e.target.value as DisputeResolution)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="" disabled>Select a final decision...</option>
                                <option value="TRADE_UPHELD">Uphold Trade (Release Escrow)</option>
                                <option value="FULL_REFUND">Full Refund (Return funds/items)</option>
                                <option value="PARTIAL_REFUND">Partial Refund (Specify in notes)</option>
                                <option value="TRADE_REVERSAL">Trade Reversal (Both parties ship back)</option>
                            </select>
                        </div>
                         <div>
                            <label htmlFor="moderatorNotes" className="block text-sm font-medium text-gray-700 mb-1">Moderator Ruling Notes</label>
                             <textarea 
                                id="moderatorNotes"
                                value={moderatorNotes}
                                onChange={e => setModeratorNotes(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                rows={8}
                                placeholder="Provide a clear and final explanation for your decision. This will be visible to both parties. (Min. 10 characters)"
                                required
                                minLength={10}
                            />
                        </div>
                         <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
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
                                className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-gray-800 hover:bg-black disabled:bg-slate-300 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Submitting Ruling...' : 'Submit Final Ruling'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default DisputeResolutionModal;