import React, { useState, useEffect } from 'react';
import { DisputeTicket } from '../types';

interface DisputeEvidenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (attachments: string[]) => void;
    disputeTicket: DisputeTicket | null;
    isSubmitting: boolean;
}

const DisputeEvidenceModal: React.FC<DisputeEvidenceModalProps> = ({ isOpen, onClose, onSubmit, disputeTicket, isSubmitting }) => {
    const [attachments, setAttachments] = useState<string[]>([]);
    
    // Reset when modal opens with a new ticket
    useEffect(() => {
        if (disputeTicket) {
            setAttachments(disputeTicket.initiatorEvidence?.attachments || []);
        } else {
            setAttachments([]);
        }
    }, [disputeTicket]);

    if (!isOpen || !disputeTicket) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // In a real app, you would upload this to a pre-signed S3 URL and get back the URL/key.
            // For this simulation, we'll just use the file name.
            // Fix: Explicitly type `file` as `File` to resolve a TypeScript type inference error.
            const fileNames = Array.from(e.target.files).map((file: File) => file.name);
            setAttachments(prev => [...prev, ...fileNames]);
        }
    };
    
    const removeAttachment = (fileName: string) => {
        setAttachments(prev => prev.filter(name => name !== fileName));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        onSubmit(attachments);
    };

    const isSnadAndNoPhotos = disputeTicket.disputeType === 'SNAD' && attachments.length === 0;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl m-4 transform transition-all"
                onClick={e => e.stopPropagation()}
            >
                <form onSubmit={handleSubmit}>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Manage Dispute Evidence</h3>
                    <p className="text-sm text-slate-500 mb-1">Trade ID: {disputeTicket.tradeId}</p>
                    <p className="text-sm text-slate-500 mb-6">Status: <span className="font-semibold text-purple-700">{disputeTicket.status.replace(/_/g, ' ')}</span></p>

                    <div className="space-y-6">
                        <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
                             <p className="text-sm font-medium text-gray-700 mb-1">Your Initial Statement:</p>
                             <p className="text-sm text-gray-600 italic">"{disputeTicket.initiatorEvidence?.statement}"</p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Upload Evidence</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                                <div className="space-y-1 text-center">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <div className="flex text-sm text-gray-600">
                                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                            <span>Upload a file</span>
                                            <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple onChange={handleFileChange} />
                                        </label>
                                        <p className="pl-1">or drag and drop</p>
                                    </div>
                                    <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                                </div>
                            </div>
                            {isSnadAndNoPhotos && <p className="text-xs text-red-500 mt-2">At least one photo is required for a 'Significantly Not As Described' dispute.</p>}
                        </div>

                        {attachments.length > 0 && (
                            <div>
                                <h4 className="text-sm font-medium text-gray-700">Attached Files:</h4>
                                <ul className="mt-2 border border-gray-200 rounded-md divide-y divide-gray-200">
                                    {attachments.map((name, index) => (
                                        <li key={index} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                                            <div className="w-0 flex-1 flex items-center">
                                                <svg className="flex-shrink-0 h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 003 3h4a3 3 0 003-3V7a3 3 0 00-3-3H8zm0 2h4a1 1 0 011 1v4a1 1 0 01-1 1H8a1 1 0 01-1-1V7a1 1 0 011-1z" clipRule="evenodd" />
                                                </svg>
                                                <span className="ml-2 flex-1 w-0 truncate">{name}</span>
                                            </div>
                                            <div className="ml-4 flex-shrink-0">
                                                <button type="button" onClick={() => removeAttachment(name)} className="font-medium text-red-600 hover:text-red-500">
                                                    Remove
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
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
                            disabled={isSnadAndNoPhotos || isSubmitting}
                            className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Evidence'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default DisputeEvidenceModal;