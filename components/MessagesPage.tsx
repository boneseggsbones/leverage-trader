/**
 * MessagesPage - Unified Inbox for Conversations
 * Shows all item inquiries and trade conversations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    fetchConversations,
    fetchConversation,
    sendMessage as sendMessageApi,
    Conversation,
    Message
} from '../api/api';

type TabType = 'all' | 'trades' | 'inquiries';

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

const ConversationListItem: React.FC<{
    conversation: Conversation;
    isSelected: boolean;
    currentUserId: number;
    onClick: () => void;
}> = ({ conversation, isSelected, currentUserId, onClick }) => {
    const getTitle = () => {
        if (conversation.type === 'item_inquiry' && conversation.contextPreview) {
            return `About: ${conversation.contextPreview.name || 'Item'}`;
        }
        if (conversation.type === 'trade' && conversation.contextPreview?.otherUser) {
            return `Trade with ${conversation.contextPreview.otherUser.name || 'User'}`;
        }
        return 'Conversation';
    };

    const getSubtitle = () => {
        if (conversation.lastMessage) {
            const isMine = conversation.lastMessage.senderId === currentUserId;
            const prefix = isMine ? 'You: ' : '';
            const content = conversation.lastMessage.content;
            return prefix + (content.length > 40 ? content.substring(0, 40) + '...' : content);
        }
        return 'No messages yet';
    };

    const getIcon = () => {
        if (conversation.type === 'item_inquiry') return '💬';
        if (conversation.type === 'trade') return '📦';
        if (conversation.type === 'chain_trade') return '🔗';
        return '💬';
    };

    const getImage = () => {
        if (conversation.type === 'item_inquiry' && conversation.contextPreview?.imageUrl) {
            const url = conversation.contextPreview.imageUrl;
            return url.startsWith('/') ? `http://localhost:4000${url}` : url;
        }
        if (conversation.type === 'trade' && conversation.contextPreview?.otherUser?.profilePictureUrl) {
            return conversation.contextPreview.otherUser.profilePictureUrl;
        }
        return null;
    };

    const hasUnread = (conversation.unreadCount || 0) > 0;

    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${isSelected
                ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
        >
            {/* Avatar/Image */}
            <div className="relative flex-shrink-0">
                {getImage() ? (
                    <img
                        src={getImage()!}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                    />
                ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xl">
                        {getIcon()}
                    </div>
                )}
                {hasUnread && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {conversation.unreadCount}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <p className={`font-medium truncate ${hasUnread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {getTitle()}
                    </p>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {conversation.lastMessage
                            ? formatRelativeTime(conversation.lastMessage.createdAt)
                            : formatRelativeTime(conversation.createdAt)
                        }
                    </span>
                </div>
                <p className={`text-sm truncate ${hasUnread ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                    {getSubtitle()}
                </p>
            </div>
        </button>
    );
};

const MessageBubble: React.FC<{ message: Message; isMine: boolean }> = ({ message, isMine }) => {
    if (message.messageType === 'system') {
        return (
            <div className="flex justify-center my-2">
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                    {message.content}
                </span>
            </div>
        );
    }

    return (
        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
            <div className={`max-w-[70%] ${isMine ? 'order-2' : 'order-1'}`}>
                {!isMine && message.senderName && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">{message.senderName}</p>
                )}
                <div className={`px-4 py-2 rounded-2xl ${isMine
                    ? 'bg-blue-500 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-md'
                    }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                <p className={`text-xs text-gray-400 mt-1 ${isMine ? 'text-right mr-1' : 'ml-1'}`}>
                    {formatRelativeTime(message.createdAt)}
                </p>
            </div>
        </div>
    );
};

const ConversationView: React.FC<{
    conversation: Conversation;
    currentUserId: number;
    onSendMessage: (content: string) => Promise<void>;
}> = ({ conversation, currentUserId, onSendMessage }) => {
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [conversation.messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || isSending) return;

        setIsSending(true);
        try {
            await onSendMessage(newMessage.trim());
            setNewMessage('');
        } finally {
            setIsSending(false);
        }
    };

    const getHeader = () => {
        if (conversation.type === 'item_inquiry' && conversation.contextPreview) {
            return {
                title: conversation.contextPreview.name || 'Item Inquiry',
                subtitle: 'Item Inquiry',
            };
        }
        if (conversation.type === 'trade' && conversation.contextPreview?.otherUser) {
            return {
                title: conversation.contextPreview.otherUser.name || 'User',
                subtitle: `Trade ID: ${conversation.contextId.substring(0, 8)}...`,
            };
        }
        return { title: 'Conversation', subtitle: '' };
    };

    const header = getHeader();

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <h2 className="font-semibold text-gray-800 dark:text-white">{header.title}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{header.subtitle}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {(!conversation.messages || conversation.messages.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500">
                        <span className="text-4xl mb-2">💬</span>
                        <p>No messages yet</p>
                        <p className="text-sm">Start the conversation!</p>
                    </div>
                ) : (
                    conversation.messages.map(msg => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            isMine={msg.senderId === currentUserId}
                        />
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || isSending}
                        className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-full font-medium transition-colors"
                    >
                        {isSending ? '...' : 'Send'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const MessagesPage: React.FC = () => {
    const { currentUser } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('all');

    const loadConversations = useCallback(async () => {
        if (!currentUser?.id) return;
        try {
            const data = await fetchConversations(currentUser.id);
            setConversations(data);
        } catch (err) {
            console.error('Failed to load conversations:', err);
        } finally {
            setIsLoading(false);
        }
    }, [currentUser?.id]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    const handleSelectConversation = async (conv: Conversation) => {
        if (!currentUser?.id) return;

        try {
            const fullConversation = await fetchConversation(conv.id, currentUser.id);
            setSelectedConversation(fullConversation);

            // Mark as read in list
            setConversations(prev => prev.map(c =>
                c.id === conv.id ? { ...c, unreadCount: 0 } : c
            ));
        } catch (err) {
            console.error('Failed to load conversation:', err);
        }
    };

    const handleSendMessage = async (content: string) => {
        if (!currentUser?.id || !selectedConversation) return;

        const message = await sendMessageApi(selectedConversation.id, currentUser.id, content);

        // Add to selected conversation
        setSelectedConversation(prev => prev ? {
            ...prev,
            messages: [...(prev.messages || []), message]
        } : null);

        // Update last message in list
        setConversations(prev => prev.map(conv =>
            conv.id === selectedConversation.id
                ? { ...conv, lastMessage: message }
                : conv
        ));
    };

    const filteredConversations = conversations.filter(conv => {
        if (activeTab === 'trades') return conv.type === 'trade';
        if (activeTab === 'inquiries') return conv.type === 'item_inquiry';
        return true;
    });

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Please log in to view messages</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            <div className="max-w-6xl mx-auto">
                <div className="flex h-[calc(100vh-80px)] bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-full md:w-80 lg:w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h1 className="text-xl font-bold text-gray-800 dark:text-white">Messages</h1>

                            {/* Tabs */}
                            <div className="flex gap-1 mt-3 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                {(['all', 'trades', 'inquiries'] as TabType[]).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === tab
                                            ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        {tab === 'all' ? 'All' : tab === 'trades' ? 'Trades' : 'Inquiries'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Conversation List */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="p-4 space-y-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="animate-pulse flex gap-3">
                                            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                                                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : filteredConversations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                    <span className="text-4xl mb-2">📭</span>
                                    <p className="text-gray-500 dark:text-gray-400">No conversations yet</p>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">
                                        Start chatting by clicking "Ask Question" on an item
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredConversations.map(conv => (
                                        <ConversationListItem
                                            key={conv.id}
                                            conversation={conv}
                                            isSelected={selectedConversation?.id === conv.id}
                                            currentUserId={parseInt(currentUser.id, 10)}
                                            onClick={() => handleSelectConversation(conv)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="hidden md:flex flex-1 flex-col">
                        {selectedConversation ? (
                            <ConversationView
                                conversation={selectedConversation}
                                currentUserId={parseInt(currentUser.id, 10)}
                                onSendMessage={handleSendMessage}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500">
                                <span className="text-6xl mb-4">💬</span>
                                <p className="text-lg">Select a conversation</p>
                                <p className="text-sm">Choose from your messages on the left</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessagesPage;
