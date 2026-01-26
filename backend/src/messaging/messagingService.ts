/**
 * Messaging Service
 * Handles conversations and messages between users
 */

import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';
import { broadcastToUser } from '../websocket';

// Types
export type ConversationType = 'item_inquiry' | 'trade' | 'chain_trade';
export type MessageType = 'text' | 'system' | 'image';

export interface Conversation {
    id: string;
    type: ConversationType;
    contextId: string;
    createdAt: string;
    updatedAt: string;
    isArchived: boolean;
    convertedToTradeId: string | null;
    // Enriched fields
    participants?: ConversationParticipant[];
    lastMessage?: Message;
    unreadCount?: number;
    contextPreview?: any; // Item or trade preview
}

export interface ConversationParticipant {
    conversationId: string;
    userId: number;
    lastReadAt: string | null;
    joinedAt: string;
    // Enriched
    userName?: string;
    userAvatar?: string;
}

export interface Message {
    id: string;
    conversationId: string;
    senderId: number;
    content: string;
    messageType: MessageType;
    createdAt: string;
    // Enriched
    senderName?: string;
    senderAvatar?: string;
}

// =====================================================
// CONVERSATION FUNCTIONS
// =====================================================

/**
 * Get or create a conversation for an item inquiry
 */
export function getOrCreateItemInquiry(
    itemId: string | number,
    inquirerUserId: number,
    ownerUserId: number
): Promise<Conversation> {
    return new Promise((resolve, reject) => {
        // Check if conversation already exists between these users for this item
        db.get(`
            SELECT c.* FROM conversations c
            JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
            JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ?
            WHERE c.type = 'item_inquiry' AND c.context_id = ? AND c.is_archived = 0
        `, [inquirerUserId, ownerUserId, String(itemId)], (err, row: any) => {
            if (err) return reject(err);

            if (row) {
                // Return existing conversation
                return resolve(mapRowToConversation(row));
            }

            // Create new conversation
            const id = `conv-${uuidv4()}`;
            const now = new Date().toISOString();

            db.run(`
                INSERT INTO conversations (id, type, context_id, created_at, updated_at)
                VALUES (?, 'item_inquiry', ?, ?, ?)
            `, [id, String(itemId), now, now], function (err2) {
                if (err2) return reject(err2);

                // Add participants
                db.run(`
                    INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
                    VALUES (?, ?, ?), (?, ?, ?)
                `, [id, inquirerUserId, now, id, ownerUserId, now], (err3) => {
                    if (err3) return reject(err3);

                    resolve({
                        id,
                        type: 'item_inquiry',
                        contextId: String(itemId),
                        createdAt: now,
                        updatedAt: now,
                        isArchived: false,
                        convertedToTradeId: null
                    });
                });
            });
        });
    });
}

/**
 * Get or create a conversation for a trade
 */
export function getOrCreateTradeConversation(
    tradeId: string,
    proposerId: number,
    receiverId: number
): Promise<Conversation> {
    return new Promise((resolve, reject) => {
        // Check if conversation already exists for this trade
        db.get(`
            SELECT * FROM conversations 
            WHERE type = 'trade' AND context_id = ?
        `, [tradeId], (err, row: any) => {
            if (err) return reject(err);

            if (row) {
                return resolve(mapRowToConversation(row));
            }

            // Create new conversation
            const id = `conv-${uuidv4()}`;
            const now = new Date().toISOString();

            db.run(`
                INSERT INTO conversations (id, type, context_id, created_at, updated_at)
                VALUES (?, 'trade', ?, ?, ?)
            `, [id, tradeId, now, now], function (err2) {
                if (err2) return reject(err2);

                // Add participants
                db.run(`
                    INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
                    VALUES (?, ?, ?), (?, ?, ?)
                `, [id, proposerId, now, id, receiverId, now], (err3) => {
                    if (err3) return reject(err3);

                    resolve({
                        id,
                        type: 'trade',
                        contextId: tradeId,
                        createdAt: now,
                        updatedAt: now,
                        isArchived: false,
                        convertedToTradeId: null
                    });
                });
            });
        });
    });
}

/**
 * Get all conversations for a user
 */
export function getConversationsForUser(
    userId: number,
    options: { includeArchived?: boolean; limit?: number } = {}
): Promise<Conversation[]> {
    const { includeArchived = false, limit = 50 } = options;

    return new Promise((resolve, reject) => {
        const archivedClause = includeArchived ? '' : 'AND c.is_archived = 0';

        db.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM messages m 
                    WHERE m.conversation_id = c.id 
                    AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count,
                   (SELECT m.content FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC LIMIT 1) as last_message_content,
                   (SELECT m.created_at FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC LIMIT 1) as last_message_at,
                   (SELECT m.sender_id FROM messages m 
                    WHERE m.conversation_id = c.id 
                    ORDER BY m.created_at DESC LIMIT 1) as last_message_sender_id
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = ?
            WHERE 1=1 ${archivedClause}
            ORDER BY COALESCE(last_message_at, c.created_at) DESC
            LIMIT ?
        `, [userId, limit], (err, rows: any[]) => {
            if (err) return reject(err);

            const conversations = (rows || []).map(row => ({
                ...mapRowToConversation(row),
                unreadCount: row.unread_count || 0,
                lastMessage: row.last_message_content ? {
                    id: '',
                    conversationId: row.id,
                    senderId: row.last_message_sender_id,
                    content: row.last_message_content,
                    messageType: 'text' as MessageType,
                    createdAt: row.last_message_at
                } : undefined
            }));

            resolve(conversations);
        });
    });
}

/**
 * Get a single conversation with all details
 */
export function getConversation(conversationId: string, userId: number): Promise<Conversation | null> {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT c.* FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = ?
            WHERE c.id = ?
        `, [userId, conversationId], (err, row: any) => {
            if (err) return reject(err);
            if (!row) return resolve(null);

            // Get participants
            db.all(`
                SELECT cp.*, u.name as user_name, u.profilePictureUrl as user_avatar
                FROM conversation_participants cp
                JOIN User u ON cp.user_id = u.id
                WHERE cp.conversation_id = ?
            `, [conversationId], (err2, participants: any[]) => {
                if (err2) return reject(err2);

                const conversation = mapRowToConversation(row);
                conversation.participants = (participants || []).map(p => ({
                    conversationId: p.conversation_id,
                    userId: p.user_id,
                    lastReadAt: p.last_read_at,
                    joinedAt: p.joined_at,
                    userName: p.user_name,
                    userAvatar: p.user_avatar
                }));

                resolve(conversation);
            });
        });
    });
}

// =====================================================
// MESSAGE FUNCTIONS
// =====================================================

/**
 * Send a message in a conversation
 */
export function sendMessage(
    conversationId: string,
    senderId: number,
    content: string,
    messageType: MessageType = 'text'
): Promise<Message> {
    return new Promise((resolve, reject) => {
        // Verify sender is participant
        db.get(`
            SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
        `, [conversationId, senderId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('You are not part of this conversation'));

            const id = `msg-${uuidv4()}`;
            const now = new Date().toISOString();

            db.run(`
                INSERT INTO messages (id, conversation_id, sender_id, content, message_type, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, conversationId, senderId, content, messageType, now], function (err2) {
                if (err2) return reject(err2);

                // Update conversation updated_at
                db.run(`UPDATE conversations SET updated_at = ? WHERE id = ?`, [now, conversationId]);

                // Update sender's last_read_at
                db.run(`UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`,
                    [now, conversationId, senderId]);

                // Get sender info for the response
                db.get(`SELECT name, profilePictureUrl FROM User WHERE id = ?`, [senderId], (err3, sender: any) => {
                    const message: Message = {
                        id,
                        conversationId,
                        senderId,
                        content,
                        messageType,
                        createdAt: now,
                        senderName: sender?.name,
                        senderAvatar: sender?.profilePictureUrl
                    };

                    // Broadcast to other participants via WebSocket
                    db.all(`
                        SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?
                    `, [conversationId, senderId], (err4, recipients: any[]) => {
                        if (!err4 && recipients) {
                            recipients.forEach(r => {
                                broadcastToUser(r.user_id, {
                                    type: 'NEW_MESSAGE',
                                    conversationId,
                                    message
                                });
                            });
                        }
                    });

                    resolve(message);
                });
            });
        });
    });
}

/**
 * Get messages for a conversation
 */
export function getMessages(
    conversationId: string,
    userId: number,
    options: { limit?: number; before?: string } = {}
): Promise<Message[]> {
    const { limit = 50, before } = options;

    return new Promise((resolve, reject) => {
        // Verify user is participant
        db.get(`
            SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
        `, [conversationId, userId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('You are not part of this conversation'));

            const beforeClause = before ? 'AND m.created_at < ?' : '';
            const params = before
                ? [conversationId, before, limit]
                : [conversationId, limit];

            db.all(`
                SELECT m.*, u.name as sender_name, u.profilePictureUrl as sender_avatar
                FROM messages m
                JOIN User u ON m.sender_id = u.id
                WHERE m.conversation_id = ? ${beforeClause}
                ORDER BY m.created_at DESC
                LIMIT ?
            `, params, (err2, rows: any[]) => {
                if (err2) return reject(err2);

                const messages = (rows || []).map(row => ({
                    id: row.id,
                    conversationId: row.conversation_id,
                    senderId: row.sender_id,
                    content: row.content,
                    messageType: row.message_type as MessageType,
                    createdAt: row.created_at,
                    senderName: row.sender_name,
                    senderAvatar: row.sender_avatar
                })).reverse(); // Oldest first

                resolve(messages);
            });
        });
    });
}

/**
 * Mark conversation as read
 */
export function markConversationRead(conversationId: string, userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`
            UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?
        `, [now, conversationId, userId], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

/**
 * Get unread message count for a user
 */
export function getUnreadMessageCount(userId: number): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT COUNT(*) as count FROM messages m
            JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
            WHERE cp.user_id = ? AND m.sender_id != ? 
            AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')
        `, [userId, userId], (err, row: any) => {
            if (err) return reject(err);
            resolve(row?.count || 0);
        });
    });
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function mapRowToConversation(row: any): Conversation {
    return {
        id: row.id,
        type: row.type as ConversationType,
        contextId: row.context_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isArchived: row.is_archived === 1,
        convertedToTradeId: row.converted_to_trade_id
    };
}

/**
 * Archive a conversation
 */
export function archiveConversation(conversationId: string, userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        // Verify user is participant
        db.get(`
            SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?
        `, [conversationId, userId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error('You are not part of this conversation'));

            db.run(`UPDATE conversations SET is_archived = 1 WHERE id = ?`, [conversationId], (err2) => {
                if (err2) return reject(err2);
                resolve();
            });
        });
    });
}
