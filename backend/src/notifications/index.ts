/**
 * Notifications Module
 * Exports notification types and service functions
 */

export { NotificationType, Notification, getNotificationIcon } from './types';
export {
    createNotification,
    getNotificationsForUser,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    notifyTradeEvent,
} from './notificationService';
