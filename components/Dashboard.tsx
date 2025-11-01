// Fix: Implemented the Dashboard component.
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNotification } from '../context/NotificationContext';
import { fetchAllUsers, fetchTradesForUser, respondToTrade, openDispute, fetchDisputeTicket, submitEvidence, submitResponse, sendMediationMessage, escalateDispute, resolveDispute } from '../api/mockApi';
import { User, Trade, TradeStatus, DisputeType, DisputeTicket, DisputeResolution } from '../types';
import ItemCard from './ItemCard';
import ConfirmationModal from './ConfirmationModal';
import DisputeModal from './DisputeModal';
import DisputeEvidenceModal from './DisputeEvidenceModal';
import DisputeResponseModal from './DisputeResponseModal';
import DisputeMediationModal from './DisputeMediationModal';
import DisputeResolutionModal from './DisputeResolutionModal';

const Dashboard: React.FC = () => {
    const { currentUser, logout, updateUser } = useAuth();
    const { navigateTo } = useNavigation();
    const { addNotification } = useNotification();

    const [otherUsers, setOtherUsers] = useState<User[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const [disputeModalState, setDisputeModalState] = useState<{isOpen: boolean, tradeId: string | null}>({isOpen: false, tradeId: null});
    const [evidenceModalState, setEvidenceModalState] = useState<{isOpen: boolean, disputeTicket: DisputeTicket | null}>({ isOpen: false, disputeTicket: null });
    const [responseModalState, setResponseModalState] = useState<{isOpen: boolean, disputeTicket: DisputeTicket | null}>({ isOpen: false, disputeTicket: null });
    const [mediationModalState, setMediationModalState] = useState<{isOpen: boolean, disputeTicket: DisputeTicket | null, otherUser: User | null}>({ isOpen: false, disputeTicket: null, otherUser: null });
    const [escalationModalState, setEscalationModalState] = useState<{isOpen: boolean, ticketId: string | null}>({isOpen: false, ticketId: null});
    const [resolutionModalState, setResolutionModalState] = useState<{isOpen: boolean, disputeTicket: DisputeTicket | null, users: User[] }>({ isOpen: false, disputeTicket: null, users: [] });

    
    const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);
    const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);
    const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [isEscalating, setIsEscalating] = useState(false);
    const [isResolving, setIsResolving] = useState(false);


    const loadDashboardData = async () => {
        if (!currentUser) return;
        try {
            setIsLoading(true);
            const [allUsers, userTrades] = await Promise.all([
                fetchAllUsers(),
                fetchTradesForUser(currentUser.id),
            ]);
            setOtherUsers(allUsers.filter(u => u.id !== currentUser.id));
            setTrades(userTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            setError(null);
        } catch (err) {
            setError("Failed to load dashboard data. Please refresh.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!currentUser) {
            navigateTo('login');
            return;
        }
        loadDashboardData();
    }, [currentUser, navigateTo]);

    const handleTradeResponse = async (tradeId: string, response: 'accept' | 'reject' | 'cancel') => {
        try {
            const updatedTrade = await respondToTrade(tradeId, response);
            setTrades(prev => prev.map(t => t.id === tradeId ? updatedTrade : t));
            addNotification(`Trade action successful.`, 'success');
             // In a real app, user data would be refetched here.
        } catch (err) {
            addNotification(`Failed to respond to trade.`, 'error');
            console.error(err);
        }
    };
    
    const handleDisputeSubmit = async (disputeType: DisputeType, statement: string) => {
        if (!disputeModalState.tradeId || !currentUser) return;
        setIsSubmittingDispute(true);
        try {
            await openDispute(disputeModalState.tradeId, currentUser.id, disputeType, statement);
            addNotification('Dispute opened successfully.', 'success');
            setDisputeModalState({isOpen: false, tradeId: null});
            await loadDashboardData(); // Refresh data from API
        } catch (err) {
            addNotification((err as Error).message || 'Failed to open dispute.', 'error');
            console.error(err);
        } finally {
            setIsSubmittingDispute(false);
        }
    };

    const handleManageDispute = async (trade: Trade) => {
        if (!trade.disputeTicketId || !currentUser) {
            addNotification('Could not find associated dispute ticket.', 'error');
            return;
        }
        try {
            const ticket = await fetchDisputeTicket(trade.disputeTicketId);
            if (!ticket) {
                 addNotification('Failed to load dispute details.', 'error');
                 return;
            }
            
            const allUsers = [...otherUsers, currentUser];
            const tradeForUsers = trades.find(t => t.id === ticket.tradeId);
            if (!tradeForUsers) {
                 addNotification('Could not find the trade associated with this dispute.', 'error');
                 return;
            }

            const isInitiator = currentUser.id === ticket.initiatorId;
            const otherPartyId = ticket.initiatorId === tradeForUsers.proposerId ? tradeForUsers.receiverId : tradeForUsers.proposerId;

            const initiator = allUsers.find(u => u.id === ticket.initiatorId);
            const otherParty = allUsers.find(u => u.id === otherPartyId);

            switch (ticket.status) {
                case 'AWAITING_EVIDENCE':
                    if (isInitiator) {
                        setEvidenceModalState({ isOpen: true, disputeTicket: ticket });
                    } else {
                        addNotification(`Waiting for ${initiator?.name || 'the other party'} to submit evidence.`, 'info');
                    }
                    break;
                case 'AWAITING_RESPONSE':
                     if (!isInitiator) { // It's the respondent's turn
                        setResponseModalState({ isOpen: true, disputeTicket: ticket });
                    } else { // Initiator is waiting
                        addNotification(`Waiting for ${otherParty?.name || 'the other party'} to respond.`, 'info');
                    }
                    break;
                case 'IN_MEDIATION':
                    setMediationModalState({ isOpen: true, disputeTicket: ticket, otherUser: otherParty || null });
                    break;
                case 'ESCALATED_TO_MODERATION':
                    const participants = [initiator, otherParty].filter(Boolean) as User[];
                    setResolutionModalState({ isOpen: true, disputeTicket: ticket, users: participants});
                    break;
                case 'RESOLVED':
                    addNotification('This dispute has been resolved by a moderator.', 'info');
                    break;
                default:
                    // Fix: Cast ticket.status to string. The compiler narrows ticket.status to `never`
                    // in this default case because all possible values of DisputeStatus are handled above.
                    // This allows graceful handling of any unexpected status values.
                    addNotification(`This dispute is currently in '${(ticket.status as string).replace(/_/g, ' ')}' status.`, 'info');
                    break;
            }
        } catch (err) {
            addNotification('Failed to load dispute details.', 'error');
        }
    };
    
    const handleEvidenceSubmit = async (attachments: string[]) => {
        if (!evidenceModalState.disputeTicket) return;
        
        setIsSubmittingEvidence(true);
        try {
            await submitEvidence(evidenceModalState.disputeTicket.id, attachments);
            addNotification('Evidence submitted successfully.', 'success');
            setEvidenceModalState({ isOpen: false, disputeTicket: null });
            // The underlying ticket state changed, but the visible trade status on the dash remains DISPUTE_OPENED.
            // No data refresh is strictly needed here unless we were showing more granular dispute status.
        } catch (err) {
             addNotification((err as Error).message || 'Failed to submit evidence.', 'error');
        } finally {
            setIsSubmittingEvidence(false);
        }
    };
    
    const handleResponseSubmit = async (statement: string, attachments: string[]) => {
        if (!responseModalState.disputeTicket) return;

        setIsSubmittingResponse(true);
        try {
            await submitResponse(responseModalState.disputeTicket.id, statement, attachments);
            addNotification('Response submitted successfully. The dispute is now in mediation.', 'success');
            setResponseModalState({ isOpen: false, disputeTicket: null });
        } catch (err) {
             addNotification((err as Error).message || 'Failed to submit response.', 'error');
        } finally {
            setIsSubmittingResponse(false);
        }
    };
    
    const handleSendMessage = async (text: string) => {
        if (!mediationModalState.disputeTicket || !currentUser) return;
        setIsSendingMessage(true);
        try {
            const updatedTicket = await sendMediationMessage(mediationModalState.disputeTicket.id, currentUser.id, text);
            // Update the state in the modal to show the new message immediately.
            setMediationModalState(prev => ({...prev, disputeTicket: updatedTicket }));
        } catch (err) {
            addNotification((err as Error).message || 'Failed to send message.', 'error');
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleConfirmEscalation = async () => {
        if (!escalationModalState.ticketId) return;

        setIsEscalating(true);
        try {
            await escalateDispute(escalationModalState.ticketId);
            addNotification('Dispute successfully escalated to a moderator.', 'success');
            setEscalationModalState({ isOpen: false, ticketId: null });
            setMediationModalState({ isOpen: false, disputeTicket: null, otherUser: null }); // Close mediation modal
            await loadDashboardData(); // Refresh data to show updated state
        } catch (err) {
            addNotification((err as Error).message || 'Failed to escalate dispute.', 'error');
        } finally {
            setIsEscalating(false);
        }
    };

    const handleResolveDispute = async (resolution: DisputeResolution, moderatorNotes: string) => {
        if (!resolutionModalState.disputeTicket || !currentUser) return;
        setIsResolving(true);
        try {
            await resolveDispute(resolutionModalState.disputeTicket.id, resolution, moderatorNotes, currentUser.id);
            addNotification('Dispute has been resolved.', 'success');
            
            // This is a critical state change that affects cash, so we need a full refresh.
            // In a real app with WebSockets/SWR, this would be handled more gracefully.
            const [allUsers, userTrades] = await Promise.all([
                fetchAllUsers(),
                fetchTradesForUser(currentUser.id),
            ]);
            setOtherUsers(allUsers.filter(u => u.id !== currentUser.id));
            setTrades(userTrades.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            const updatedCurrentUser = allUsers.find(u => u.id === currentUser.id);
            if (updatedCurrentUser) {
                updateUser(updatedCurrentUser); // Update context with fresh user data
            }

        } catch (err) {
            addNotification((err as Error).message || 'Failed to resolve dispute.', 'error');
        } finally {
            setResolutionModalState({ isOpen: false, disputeTicket: null, users: [] });
            setIsResolving(false);
        }
    };
    
    if (!currentUser) return null;
    
    const getStatusClasses = (status: TradeStatus) => {
        switch (status) {
            case TradeStatus.PENDING_ACCEPTANCE: return 'bg-yellow-100 text-yellow-800';
            case TradeStatus.COMPLETED: return 'bg-green-100 text-green-800';
            case TradeStatus.REJECTED:
            case TradeStatus.CANCELLED:
                 return 'bg-red-100 text-red-800';
            case TradeStatus.DELIVERED_AWAITING_VERIFICATION: return 'bg-blue-100 text-blue-800';
            case TradeStatus.DISPUTE_OPENED: return 'bg-purple-100 text-purple-800';
            case TradeStatus.DISPUTE_RESOLVED: return 'bg-gray-800 text-white';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const renderTrade = (trade: Trade) => {
        const isReceiver = trade.receiverId === currentUser.id;
        const otherPartyId = isReceiver ? trade.proposerId : trade.receiverId;
        const otherParty = [...otherUsers, currentUser].find(u => u.id === otherPartyId);
        
        const canDispute = trade.status === TradeStatus.DELIVERED_AWAITING_VERIFICATION;
        const isDisputed = trade.status === TradeStatus.DISPUTE_OPENED;

        return (
             <div key={trade.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm text-gray-500">
                            Trade with <span className="font-bold">{otherParty?.name || 'Unknown User'}</span>
                        </p>
                        <p className="text-xs text-gray-400">Last updated: {new Date(trade.updatedAt).toLocaleDateString()}</p>
                    </div>
                     <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusClasses(trade.status)}`}>{trade.status.replace(/_/g, ' ')}</span>
                </div>
                 
                 <div className="mt-4 flex gap-2">
                    {trade.status === TradeStatus.PENDING_ACCEPTANCE && isReceiver && (
                        <>
                            <button onClick={() => handleTradeResponse(trade.id, 'accept')} className="px-3 py-1 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md">Accept</button>
                            <button onClick={() => handleTradeResponse(trade.id, 'reject')} className="px-3 py-1 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md">Reject</button>
                        </>
                    )}
                    {trade.status === TradeStatus.PENDING_ACCEPTANCE && !isReceiver && (
                         <button onClick={() => handleTradeResponse(trade.id, 'cancel')} className="px-3 py-1 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md">Cancel</button>
                    )}
                    {canDispute && (
                        <button onClick={() => setDisputeModalState({ isOpen: true, tradeId: trade.id })} className="px-3 py-1 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-md">File Dispute</button>
                    )}
                    {isDisputed && (
                        <button onClick={() => handleManageDispute(trade)} className="px-3 py-1 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-md">Manage Dispute</button>
                    )}
                 </div>
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Welcome, {currentUser.name}</h1>
                         <p className="text-sm text-slate-500">Cash: ${(currentUser.cash / 100).toLocaleString()}</p>
                    </div>
                    <div>
                         <button onClick={() => navigateTo('trade-history')} className="mr-4 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Trade History</button>
                        <button onClick={logout} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md">Logout</button>
                    </div>
                </div>
            </header>
            <main className="py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 mb-4">Your Inventory</h2>
                            <div className="bg-white p-4 rounded-lg shadow">
                                {currentUser.inventory.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {currentUser.inventory.map(item => <ItemCard key={item.id} item={item} />)}
                                    </div>
                                ) : <p className="text-slate-500">Your inventory is empty.</p>}
                            </div>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-700 mb-4">Other Traders</h2>
                             <div className="bg-white p-4 rounded-lg shadow">
                                <div className="space-y-4">
                                    {otherUsers.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-2 border-b border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full" />
                                                <span className="font-semibold">{user.name}</span>
                                            </div>
                                            <button onClick={() => navigateTo('trade-desk', { otherUserId: user.id })} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md">
                                                Trade
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="md:col-span-1">
                        <h2 className="text-xl font-bold text-gray-700 mb-4">Trade Activity</h2>
                        <div className="bg-white p-4 rounded-lg shadow space-y-4">
                            {isLoading ? <p>Loading trades...</p> : error ? <p className="text-red-500">{error}</p> : trades.length > 0 ? trades.map(renderTrade) : <p className="text-slate-500">No active trades.</p>}
                        </div>
                    </div>
                </div>
            </main>
            {disputeModalState.isOpen && disputeModalState.tradeId && (
                <DisputeModal 
                    isOpen={disputeModalState.isOpen}
                    onClose={() => setDisputeModalState({ isOpen: false, tradeId: null })}
                    onSubmit={handleDisputeSubmit}
                    tradeId={disputeModalState.tradeId}
                    isSubmitting={isSubmittingDispute}
                />
            )}
             {evidenceModalState.isOpen && (
                <DisputeEvidenceModal
                    isOpen={evidenceModalState.isOpen}
                    onClose={() => setEvidenceModalState({ isOpen: false, disputeTicket: null })}
                    onSubmit={handleEvidenceSubmit}
                    disputeTicket={evidenceModalState.disputeTicket}
                    isSubmitting={isSubmittingEvidence}
                />
            )}
            {responseModalState.isOpen && (
                <DisputeResponseModal
                    isOpen={responseModalState.isOpen}
                    onClose={() => setResponseModalState({ isOpen: false, disputeTicket: null })}
                    onSubmit={handleResponseSubmit}
                    disputeTicket={responseModalState.disputeTicket}
                    isSubmitting={isSubmittingResponse}
                />
            )}
            {mediationModalState.isOpen && (
                <DisputeMediationModal
                    isOpen={mediationModalState.isOpen}
                    onClose={() => setMediationModalState({ isOpen: false, disputeTicket: null, otherUser: null })}
                    onSubmitMessage={handleSendMessage}
                    onEscalate={() => setEscalationModalState({ isOpen: true, ticketId: mediationModalState.disputeTicket?.id || null })}
                    disputeTicket={mediationModalState.disputeTicket}
                    currentUser={currentUser}
                    otherUser={mediationModalState.otherUser}
                    isSubmitting={isSendingMessage}
                />
            )}
            {resolutionModalState.isOpen && (
                <DisputeResolutionModal
                    isOpen={resolutionModalState.isOpen}
                    onClose={() => setResolutionModalState({ isOpen: false, disputeTicket: null, users: [] })}
                    onSubmit={handleResolveDispute}
                    disputeTicket={resolutionModalState.disputeTicket}
                    users={resolutionModalState.users}
                    isSubmitting={isResolving}
                />
            )}
            <ConfirmationModal
                isOpen={escalationModalState.isOpen}
                onClose={() => setEscalationModalState({ isOpen: false, ticketId: null })}
                onConfirm={handleConfirmEscalation}
                title="Confirm Escalation"
                confirmButtonText={isEscalating ? "Escalating..." : "Yes, Escalate"}
                confirmButtonClass="bg-red-600 hover:bg-red-700"
            >
                Are you sure you want to escalate this dispute to a moderator? This action cannot be undone. All mediation will stop, and a moderator will make a final decision.
            </ConfirmationModal>
        </div>
    );
};

export default Dashboard;
