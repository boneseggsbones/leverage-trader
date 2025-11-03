import React, { useState, useEffect, useRef } from 'react';
import { DisputeTicket, User } from '../types';

interface DisputeMediationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmitMessage: (text: string) => void;
    onEscalate: () => void;
    disputeTicket: DisputeTicket | null;
    currentUser: User | null;
    otherUser: User | null;
    isSubmitting: boolean;
}

const DisputeMediationModal: React.FC<DisputeMediationModalProps> = ({
    isOpen,
    onClose,
    onSubmitMessage,
    onEscalate,
    disputeTicket,
    currentUser,
    otherUser,
    isSubmitting
}) => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [isOpen, disputeTicket?.mediationLog]);

    if (!isOpen || !disputeTicket || !currentUser || !otherUser) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedMessage = newMessage.trim();
        if (trimmedMessage && !isSubmitting) {
            onSubmitMessage(trimmedMessage);
            setNewMessage('');
        }
    };
    
    const EvidencePanel: React.FC<{ title: string; evidence: { statement: string; attachments: string[] } | null; user: User | null }> = ({ title, evidence, user }) => {
        if (!evidence) return null;
        return (
            <div className="mb-2">
                <h4 className="text-sm font-semibold text-gray-700">{title} ({user?.name}):</h4>
                <p className="text-sm text-gray-600 italic bg-gray-100 p-2 rounded-md">"{evidence.statement}"</p>
                {evidence.attachments.length > 0 && (
                    <ul className="text-xs list-disc list-inside pl-2 mt-1">
                        {evidence.attachments.map((file, i) => <li key={i}>{file}</li>)}
                    </ul>
                )}
            </div>
        );
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 transform transition-all flex flex-col"
                style={{ height: 'clamp(400px, 80vh, 700px)' }}
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-slate-800">Dispute Mediation</h3>
                    <p className="text-sm text-slate-500">Trade with {otherUser.name} | Closes: {new Date(disputeTicket.deadlineForNextAction).toLocaleDateString()}</p>
                </header>

                <details className="p-4 border-b border-gray-200 bg-gray-50">
                    <summary className="text-sm font-medium text-gray-700 cursor-pointer">Show Evidence Summary</summary>
                    <div className="mt-4">
                       <EvidencePanel title="Initiator's Claim" evidence={disputeTicket.initiatorEvidence} user={disputeTicket.initiatorId === currentUser.id ? currentUser : otherUser} />
                       <EvidencePanel title="Respondent's Statement" evidence={disputeTicket.respondentEvidence} user={disputeTicket.initiatorId === currentUser.id ? otherUser : currentUser} />
                    </div>
                </details>

                <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
                    <div className="space-y-4">
                        {disputeTicket.mediationLog.map(message => {
                            const isCurrentUser = message.senderId === currentUser.id;
                            return (
                                <div key={message.id} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${isCurrentUser ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                                        <p className="text-sm">{message.text}</p>
                                        <p className={`text-xs mt-1 ${isCurrentUser ? 'text-blue-200' : 'text-gray-500'}`}>
                                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                         <div ref={messagesEndRef} />
                    </div>
                </div>

                <footer className="p-4 border-t border-gray-200 space-y-3">
                     <form onSubmit={handleSubmit} className="flex gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            disabled={isSubmitting}
                        />
                        <button 
                            type="submit"
                            disabled={!newMessage.trim() || isSubmitting}
                            className="px-6 py-2 text-sm font-semibold text-white rounded-md transition-colors shadow-sm bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Sending...' : 'Send'}
                        </button>
                    </form>
                    <div className="text-center">
                         <button
                            onClick={onEscalate}
                            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                        >
                            Can't agree? Escalate to Moderator
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default DisputeMediationModal;