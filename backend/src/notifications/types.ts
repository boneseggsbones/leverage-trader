/**
 * Notification Types
 * Defines the structure for persistent user notifications
 */

export enum NotificationType {
    TRADE_PROPOSED = 'TRADE_PROPOSED',
    TRADE_ACCEPTED = 'TRADE_ACCEPTED',
    TRADE_REJECTED = 'TRADE_REJECTED',
    TRADE_CANCELLED = 'TRADE_CANCELLED',
    ESCROW_FUNDED = 'ESCROW_FUNDED',
    ESCROW_RELEASED = 'ESCROW_RELEASED',
    TRACKING_ADDED = 'TRACKING_ADDED',
    ITEMS_VERIFIED = 'ITEMS_VERIFIED',
    TRADE_COMPLETED = 'TRADE_COMPLETED',
    DISPUTE_OPENED = 'DISPUTE_OPENED',
    COUNTER_OFFER = 'COUNTER_OFFER',
    WISHLIST_ITEM_AVAILABLE = 'WISHLIST_ITEM_AVAILABLE',
    WISHLIST_MATCH_FOUND = 'WISHLIST_MATCH_FOUND',
    // Chain trade notifications
    CHAIN_TRADE_OPPORTUNITY = 'CHAIN_TRADE_OPPORTUNITY',
    CHAIN_TRADE_LOCKED = 'CHAIN_TRADE_LOCKED',
    CHAIN_TRADE_CANCELLED = 'CHAIN_TRADE_CANCELLED',
    CHAIN_TRADE_SHIPPING = 'CHAIN_TRADE_SHIPPING',
    CHAIN_TRADE_COMPLETED = 'CHAIN_TRADE_COMPLETED',
}

export interface Notification {
    id: string;
    userId: string;
    type: NotificationType;
    tradeId: string | null;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

// Helper to get notification icon based on type
export function getNotificationIcon(type: NotificationType): string {
    switch (type) {
        case NotificationType.TRADE_PROPOSED:
            return '📨';
        case NotificationType.TRADE_ACCEPTED:
            return '✅';
        case NotificationType.TRADE_REJECTED:
            return '❌';
        case NotificationType.TRADE_CANCELLED:
            return '🚫';
        case NotificationType.ESCROW_FUNDED:
            return '💰';
        case NotificationType.ESCROW_RELEASED:
            return '💸';
        case NotificationType.TRACKING_ADDED:
            return '📦';
        case NotificationType.ITEMS_VERIFIED:
            return '✔️';
        case NotificationType.TRADE_COMPLETED:
            return '🎉';
        case NotificationType.DISPUTE_OPENED:
            return '⚠️';
        case NotificationType.COUNTER_OFFER:
            return '🔄';
        case NotificationType.WISHLIST_ITEM_AVAILABLE:
            return '💫';
        case NotificationType.WISHLIST_MATCH_FOUND:
            return '🔥';
        default:
            return '🔔';
    }
}
