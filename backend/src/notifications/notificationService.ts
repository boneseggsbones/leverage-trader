/**
 * Notification Service
 * Handles creating and retrieving persistent user notifications
 */

import { db } from '../database';
import { NotificationType, Notification, getNotificationIcon } from './types';
import { broadcastToUser } from '../websocket';
import { sendTradeEventEmail } from './emailService';

/**
 * Helper to get user's email from the database
 */
async function getUserEmail(userId: string | number): Promise<string | null> {
    return new Promise((resolve) => {
        db.get(
            'SELECT email FROM User WHERE id = ?',
            [String(userId)],
            (err, row: any) => {
                if (err || !row) {
                    resolve(null);
                } else {
                    resolve(row.email || null);
                }
            }
        );
    });
}

/**
 * Create a notification for a user
 */
export async function createNotification(
    userId: string | number,
    type: NotificationType,
    title: string,
    message: string,
    tradeId?: string | null
): Promise<Notification> {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO notifications (id, user_id, type, trade_id, title, message, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [id, String(userId), type, tradeId || null, title, message, now],
            function (err) {
                if (err) {
                    console.error('[Notifications] Error creating notification:', err);
                    reject(err);
                } else {
                    console.log(`[Notifications] Created ${type} notification for user ${userId}`);
                    const notification: Notification = {
                        id,
                        userId: String(userId),
                        type,
                        tradeId: tradeId || null,
                        title,
                        message,
                        isRead: false,
                        createdAt: now,
                    };

                    // Broadcast notification via WebSocket for real-time updates
                    broadcastToUser(userId, {
                        type: 'NEW_NOTIFICATION',
                        notification
                    });

                    resolve(notification);
                }
            }
        );
    });
}

/**
 * Get all notifications for a user
 */
export async function getNotificationsForUser(
    userId: string | number,
    limit: number = 50
): Promise<Notification[]> {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM notifications 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [String(userId), limit],
            (err, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        id: row.id,
                        userId: row.user_id,
                        type: row.type as NotificationType,
                        tradeId: row.trade_id,
                        title: row.title,
                        message: row.message,
                        isRead: row.is_read === 1,
                        createdAt: row.created_at,
                    })));
                }
            }
        );
    });
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string | number): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
            [String(userId)],
            (err, row: any) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            }
        );
    });
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE notifications SET is_read = 1 WHERE id = ?`,
            [notificationId],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string | number): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
            [String(userId)],
            function (err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Helper to create trade-related notifications with nice titles/messages
export async function notifyTradeEvent(
    type: NotificationType,
    recipientId: string | number,
    tradeId: string,
    otherUserName: string
): Promise<Notification> {
    const icon = getNotificationIcon(type);
    let title: string;
    let message: string;

    switch (type) {
        case NotificationType.TRADE_PROPOSED:
            title = `${icon} New Trade Proposal`;
            message = `${otherUserName} wants to trade with you!`;
            break;
        case NotificationType.TRADE_ACCEPTED:
            title = `${icon} Trade Accepted`;
            message = `${otherUserName} accepted your trade proposal.`;
            break;
        case NotificationType.TRADE_REJECTED:
            title = `${icon} Trade Declined`;
            message = `${otherUserName} declined your trade proposal.`;
            break;
        case NotificationType.TRADE_CANCELLED:
            title = `${icon} Trade Cancelled`;
            message = `${otherUserName} cancelled the trade.`;
            break;
        case NotificationType.ESCROW_FUNDED:
            title = `${icon} Payment Received`;
            message = `${otherUserName} funded the escrow. Money is secured!`;
            break;
        case NotificationType.ESCROW_RELEASED:
            title = `${icon} Payment Released`;
            message = `Escrow payment has been released.`;
            break;
        case NotificationType.TRACKING_ADDED:
            title = `${icon} Shipment Update`;
            message = `${otherUserName} added tracking info for their shipment.`;
            break;
        case NotificationType.ITEMS_VERIFIED:
            title = `${icon} Items Verified`;
            message = `${otherUserName} verified receipt of items.`;
            break;
        case NotificationType.TRADE_COMPLETED:
            title = `${icon} Trade Complete!`;
            message = `Your trade with ${otherUserName} is complete.`;
            break;
        case NotificationType.DISPUTE_OPENED:
            title = `${icon} Dispute Opened`;
            message = `${otherUserName} opened a dispute on your trade.`;
            break;
        case NotificationType.COUNTER_OFFER:
            title = `${icon} Counter Offer`;
            message = `${otherUserName} sent a counter offer.`;
            break;
        default:
            title = `${icon} Trade Update`;
            message = `There's an update on your trade with ${otherUserName}.`;
    }

    const notification = await createNotification(recipientId, type, title, message, tradeId);

    // Send email notification for high-priority events (fire and forget)
    getUserEmail(recipientId).then((email) => {
        if (email) {
            sendTradeEventEmail(email, type, otherUserName, tradeId).catch((err) => {
                console.error('[Notifications] Email send failed:', err);
            });
        }
    });

    return notification;
}

// Export for use
export { NotificationType } from './types';
