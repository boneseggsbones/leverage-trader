/**
 * Shipping Service
 * Handles carrier detection, tracking status, and delivery confirmation
 */

import { db } from './database';

// Tracking status enum
export type TrackingStatus =
    | 'LABEL_CREATED'
    | 'PICKED_UP'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'EXCEPTION'
    | 'UNKNOWN';

// Detected carriers
export type Carrier = 'USPS' | 'UPS' | 'FEDEX' | 'DHL' | 'UNKNOWN';

export interface TrackingInfo {
    trackingNumber: string;
    carrier: Carrier;
    status: TrackingStatus;
    statusDetail: string | null;
    location: string | null;
    estimatedDelivery: string | null;
    deliveredAt: string | null;
    lastUpdated: string;
}

/**
 * Detect carrier from tracking number pattern
 */
export function detectCarrier(trackingNumber: string): Carrier {
    const cleaned = trackingNumber.replace(/\s+/g, '').toUpperCase();

    // USPS: 20-22 digits, usually starts with 9
    if (/^9[0-9]{19,21}$/.test(cleaned)) {
        return 'USPS';
    }

    // USPS Priority Mail: starts with specific prefixes
    if (/^(94|93|92|91)[0-9]{17,21}$/.test(cleaned)) {
        return 'USPS';
    }

    // UPS: 1Z + 16 alphanumeric
    if (/^1Z[A-Z0-9]{16}$/.test(cleaned)) {
        return 'UPS';
    }

    // FedEx: 12-15 digits
    if (/^[0-9]{12,15}$/.test(cleaned)) {
        return 'FEDEX';
    }

    // FedEx: 22 digits
    if (/^[0-9]{22}$/.test(cleaned)) {
        return 'FEDEX';
    }

    // DHL: 10 digits or starts with JD
    if (/^[0-9]{10}$/.test(cleaned) || /^JD[0-9]{18}$/.test(cleaned)) {
        return 'DHL';
    }

    // Test tracking numbers (for development)
    if (cleaned.startsWith('TRACK-') || cleaned.startsWith('TEST')) {
        return 'UNKNOWN';
    }

    return 'UNKNOWN';
}

/**
 * Get mock tracking status based on time elapsed since creation
 * In production, this would call actual carrier APIs
 */
export function getMockTrackingStatus(createdAt: string): { status: TrackingStatus; statusDetail: string; location: string } {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const hoursElapsed = (now - created) / (1000 * 60 * 60);

    if (hoursElapsed < 1) {
        return {
            status: 'LABEL_CREATED',
            statusDetail: 'Shipping label created, awaiting pickup',
            location: 'Origin facility'
        };
    } else if (hoursElapsed < 4) {
        return {
            status: 'PICKED_UP',
            statusDetail: 'Package picked up by carrier',
            location: 'Local post office'
        };
    } else if (hoursElapsed < 24) {
        return {
            status: 'IN_TRANSIT',
            statusDetail: 'Package in transit to destination',
            location: 'Regional distribution center'
        };
    } else if (hoursElapsed < 48) {
        return {
            status: 'OUT_FOR_DELIVERY',
            statusDetail: 'Package out for delivery',
            location: 'Local delivery facility'
        };
    } else {
        return {
            status: 'DELIVERED',
            statusDetail: 'Package delivered',
            location: 'Delivered to recipient'
        };
    }
}

/**
 * Create or update tracking record for a shipment
 */
export async function createTrackingRecord(
    tradeId: string,
    userId: number,
    trackingNumber: string
): Promise<TrackingInfo> {
    const carrier = detectCarrier(trackingNumber);
    const now = new Date().toISOString();

    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO shipment_tracking 
            (trade_id, user_id, tracking_number, carrier, status, status_detail, location, created_at, last_updated)
            VALUES (?, ?, ?, ?, 'LABEL_CREATED', 'Shipping label created', 'Origin', ?, ?)`,
            [tradeId, userId, trackingNumber, carrier, now, now],
            function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        trackingNumber,
                        carrier,
                        status: 'LABEL_CREATED',
                        statusDetail: 'Shipping label created',
                        location: 'Origin',
                        estimatedDelivery: null,
                        deliveredAt: null,
                        lastUpdated: now
                    });
                }
            }
        );
    });
}

/**
 * Get tracking info for a trade
 */
export async function getTrackingForTrade(tradeId: string): Promise<{
    proposerTracking: TrackingInfo | null;
    receiverTracking: TrackingInfo | null;
}> {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM shipment_tracking WHERE trade_id = ?', [tradeId], (err: Error | null, rows: any[]) => {
            if (err) {
                reject(err);
                return;
            }

            // Get trade to know who is proposer/receiver
            db.get('SELECT proposerId, receiverId FROM trades WHERE id = ?', [tradeId], (err2: Error | null, trade: any) => {
                if (err2) {
                    reject(err2);
                    return;
                }

                let proposerTracking: TrackingInfo | null = null;
                let receiverTracking: TrackingInfo | null = null;

                rows?.forEach((row: any) => {
                    // Update status based on time (mock API)
                    const mockStatus = getMockTrackingStatus(row.created_at);

                    const trackingInfo: TrackingInfo = {
                        trackingNumber: row.tracking_number,
                        carrier: row.carrier as Carrier,
                        status: mockStatus.status,
                        statusDetail: mockStatus.statusDetail,
                        location: mockStatus.location,
                        estimatedDelivery: row.estimated_delivery,
                        deliveredAt: mockStatus.status === 'DELIVERED' ? new Date().toISOString() : null,
                        lastUpdated: new Date().toISOString()
                    };

                    if (String(row.user_id) === String(trade?.proposerId)) {
                        proposerTracking = trackingInfo;
                    } else if (String(row.user_id) === String(trade?.receiverId)) {
                        receiverTracking = trackingInfo;
                    }
                });

                resolve({ proposerTracking, receiverTracking });
            });
        });
    });
}

/**
 * Check if both parties' shipments are delivered
 */
export async function checkBothDelivered(tradeId: string): Promise<boolean> {
    const tracking = await getTrackingForTrade(tradeId);

    const proposerDelivered = tracking.proposerTracking?.status === 'DELIVERED';
    const receiverDelivered = tracking.receiverTracking?.status === 'DELIVERED';

    return proposerDelivered && receiverDelivered;
}
