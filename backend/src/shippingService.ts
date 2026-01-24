/**
 * Shipping Service
 * Handles carrier detection, tracking status, and delivery confirmation
 * 
 * Gap 1 Fix: Integrated Shippo API for real tracking validation
 */

import { db } from './database';

// Shippo API configuration
const SHIPPO_API_KEY = process.env.SHIPPO_API_KEY;
const SHIPPO_API_URL = 'https://api.goshippo.com';

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

// Shippo carrier codes
const CARRIER_MAP: Record<Carrier, string> = {
    'USPS': 'usps',
    'UPS': 'ups',
    'FEDEX': 'fedex',
    'DHL': 'dhl_express',
    'UNKNOWN': 'usps', // Default to USPS for unknown
};

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

export interface ShippoValidationResult {
    isValid: boolean;
    status?: TrackingStatus;
    statusDetail?: string;
    location?: string;
    carrier?: string;
    error?: string;
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
 * Used as fallback when Shippo API is not configured
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
 * Gap 1 Fix: Validate tracking number via Shippo API
 * Confirms the tracking number is real and returns current status
 * Falls back gracefully if API is not configured
 */
export async function validateWithShippo(
    trackingNumber: string,
    carrier?: Carrier
): Promise<ShippoValidationResult> {
    // If no API key, skip validation (development mode)
    if (!SHIPPO_API_KEY) {
        console.log('[Shipping] Shippo API not configured, skipping validation');
        return { isValid: true, status: 'LABEL_CREATED', statusDetail: 'Validation skipped (dev mode)' };
    }

    // Allow test tracking numbers in development
    const cleaned = trackingNumber.replace(/\s+/g, '').toUpperCase();
    if (cleaned.startsWith('TRACK-') || cleaned.startsWith('TEST')) {
        console.log('[Shipping] Test tracking number detected, skipping API validation');
        return { isValid: true, status: 'LABEL_CREATED', statusDetail: 'Test tracking number' };
    }

    try {
        const detectedCarrier = carrier || detectCarrier(trackingNumber);
        const shippoCarrier = CARRIER_MAP[detectedCarrier];

        console.log(`[Shipping] Validating tracking ${trackingNumber} with carrier ${shippoCarrier} via Shippo...`);

        const response = await fetch(`${SHIPPO_API_URL}/tracks/${shippoCarrier}/${trackingNumber}`, {
            method: 'GET',
            headers: {
                'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Shipping] Shippo API error: ${response.status} - ${errorText}`);

            // 404 or 400 typically means invalid tracking number
            if (response.status === 404 || response.status === 400) {
                return { isValid: false, error: 'Invalid or unknown tracking number' };
            }

            // For other errors, allow through but log (API issue, not user's fault)
            return { isValid: true, status: 'UNKNOWN', statusDetail: 'Could not verify (API error)' };
        }

        const data = await response.json();

        // Map Shippo status to our status enum
        const shippoStatus = data.tracking_status?.status || 'UNKNOWN';
        let mappedStatus: TrackingStatus = 'UNKNOWN';

        switch (shippoStatus.toUpperCase()) {
            case 'PRE_TRANSIT':
                mappedStatus = 'LABEL_CREATED';
                break;
            case 'TRANSIT':
                mappedStatus = 'IN_TRANSIT';
                break;
            case 'DELIVERED':
                mappedStatus = 'DELIVERED';
                break;
            case 'RETURNED':
            case 'FAILURE':
                mappedStatus = 'EXCEPTION';
                break;
            default:
                mappedStatus = 'UNKNOWN';
        }

        console.log(`[Shipping] Tracking ${trackingNumber} validated: ${mappedStatus}`);

        return {
            isValid: true,
            status: mappedStatus,
            statusDetail: data.tracking_status?.status_details || null,
            location: data.tracking_status?.location?.city || null,
            carrier: data.carrier,
        };

    } catch (error: any) {
        console.error(`[Shipping] Shippo validation error:`, error.message);
        // Network errors - allow through but mark as unverified
        return { isValid: true, status: 'UNKNOWN', statusDetail: 'Could not verify (network error)' };
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
 * Get tracking info for a trade - uses LIVE Shippo API for status updates
 */
export async function getTrackingForTrade(tradeId: string): Promise<{
    proposerTracking: TrackingInfo | null;
    receiverTracking: TrackingInfo | null;
}> {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM shipment_tracking WHERE trade_id = ?', [tradeId], async (err: Error | null, rows: any[]) => {
            if (err) {
                reject(err);
                return;
            }

            // Get trade to know who is proposer/receiver
            db.get('SELECT proposerId, receiverId FROM trades WHERE id = ?', [tradeId], async (err2: Error | null, trade: any) => {
                if (err2) {
                    reject(err2);
                    return;
                }

                let proposerTracking: TrackingInfo | null = null;
                let receiverTracking: TrackingInfo | null = null;

                // Process each tracking record with LIVE Shippo status
                for (const row of rows || []) {
                    let trackingInfo: TrackingInfo;

                    // Use Shippo API if configured, otherwise fall back to mock
                    if (SHIPPO_API_KEY) {
                        const liveStatus = await fetchLiveTrackingStatus(
                            row.tracking_number,
                            row.carrier as Carrier
                        );

                        trackingInfo = {
                            trackingNumber: row.tracking_number,
                            carrier: row.carrier as Carrier,
                            status: liveStatus.status,
                            statusDetail: liveStatus.statusDetail || null,
                            location: liveStatus.location || null,
                            estimatedDelivery: liveStatus.estimatedDelivery || null,
                            deliveredAt: liveStatus.status === 'DELIVERED' ? new Date().toISOString() : null,
                            lastUpdated: new Date().toISOString()
                        };

                        // Update cached status in database
                        db.run(
                            `UPDATE shipment_tracking SET status = ?, status_detail = ?, location = ?, last_updated = ? WHERE trade_id = ? AND user_id = ?`,
                            [liveStatus.status, liveStatus.statusDetail, liveStatus.location, new Date().toISOString(), tradeId, row.user_id]
                        );
                    } else {
                        // Fallback to mock for development
                        const mockStatus = getMockTrackingStatus(row.created_at);
                        trackingInfo = {
                            trackingNumber: row.tracking_number,
                            carrier: row.carrier as Carrier,
                            status: mockStatus.status,
                            statusDetail: mockStatus.statusDetail,
                            location: mockStatus.location,
                            estimatedDelivery: row.estimated_delivery,
                            deliveredAt: mockStatus.status === 'DELIVERED' ? new Date().toISOString() : null,
                            lastUpdated: new Date().toISOString()
                        };
                    }

                    if (String(row.user_id) === String(trade?.proposerId)) {
                        proposerTracking = trackingInfo;
                    } else if (String(row.user_id) === String(trade?.receiverId)) {
                        receiverTracking = trackingInfo;
                    }
                }

                resolve({ proposerTracking, receiverTracking });
            });
        });
    });
}

/**
 * Fetch live tracking status from Shippo API
 */
async function fetchLiveTrackingStatus(
    trackingNumber: string,
    carrier: Carrier
): Promise<{
    status: TrackingStatus;
    statusDetail: string | null;
    location: string | null;
    estimatedDelivery: string | null;
}> {
    // Allow test tracking numbers
    const cleaned = trackingNumber.replace(/\s+/g, '').toUpperCase();
    if (cleaned.startsWith('TRACK-') || cleaned.startsWith('TEST')) {
        return { status: 'IN_TRANSIT', statusDetail: 'Test tracking number', location: null, estimatedDelivery: null };
    }

    try {
        const shippoCarrier = CARRIER_MAP[carrier];
        const response = await fetch(`${SHIPPO_API_URL}/tracks/${shippoCarrier}/${trackingNumber}`, {
            method: 'GET',
            headers: {
                'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            console.error(`[Shipping] Shippo status fetch failed: ${response.status}`);
            return { status: 'UNKNOWN', statusDetail: 'Could not fetch status', location: null, estimatedDelivery: null };
        }

        const data = await response.json();

        // Map Shippo status
        const shippoStatus = data.tracking_status?.status || 'UNKNOWN';
        let mappedStatus: TrackingStatus = 'UNKNOWN';

        switch (shippoStatus.toUpperCase()) {
            case 'PRE_TRANSIT': mappedStatus = 'LABEL_CREATED'; break;
            case 'TRANSIT': mappedStatus = 'IN_TRANSIT'; break;
            case 'DELIVERED': mappedStatus = 'DELIVERED'; break;
            case 'RETURNED':
            case 'FAILURE': mappedStatus = 'EXCEPTION'; break;
            default: mappedStatus = 'IN_TRANSIT';
        }

        return {
            status: mappedStatus,
            statusDetail: data.tracking_status?.status_details || null,
            location: data.tracking_status?.location?.city || null,
            estimatedDelivery: data.eta || null,
        };

    } catch (error: any) {
        console.error(`[Shipping] Error fetching live status:`, error.message);
        return { status: 'UNKNOWN', statusDetail: 'Network error', location: null, estimatedDelivery: null };
    }
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
