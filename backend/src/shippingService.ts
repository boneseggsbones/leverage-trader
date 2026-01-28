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

// =====================================================
// SHIPPO ADDRESS VALIDATION, RATE QUOTES, AND LABELS
// =====================================================

export interface ShippoAddress {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country?: string;
    phone?: string;
    email?: string;
}

export interface AddressValidationResult {
    isValid: boolean;
    validatedAddress?: ShippoAddress;
    messages?: string[];
    objectId?: string; // Shippo address ID for reuse
}

export interface Parcel {
    length: number; // inches
    width: number;  // inches
    height: number; // inches
    weight: number; // oz
    massUnit?: 'oz' | 'lb' | 'g' | 'kg';
    distanceUnit?: 'in' | 'cm';
}

export interface ShippingRate {
    rateId: string;
    carrier: string;
    carrierAccount: string;
    servicelevel: {
        name: string;
        token: string;
    };
    amount: string; // e.g., "7.50"
    currency: string;
    estimatedDays: number | null;
    durationTerms: string | null;
}

export interface ShipmentResult {
    shipmentId: string;
    rates: ShippingRate[];
    status: string;
    messages?: any[];
}

export interface LabelResult {
    success: boolean;
    transactionId?: string;
    trackingNumber?: string;
    labelUrl?: string;
    carrier?: string;
    servicelevel?: string;
    error?: string;
}

/**
 * Validate a shipping address via Shippo API
 */
export async function validateAddress(address: ShippoAddress): Promise<AddressValidationResult> {
    if (!SHIPPO_API_KEY) {
        console.log('[Shipping] Shippo API not configured, skipping address validation');
        return { isValid: true, validatedAddress: address, messages: ['Validation skipped (dev mode)'] };
    }

    try {
        console.log(`[Shipping] Validating address: ${address.street1}, ${address.city}, ${address.state}`);

        const response = await fetch(`${SHIPPO_API_URL}/addresses/`, {
            method: 'POST',
            headers: {
                'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: address.name,
                street1: address.street1,
                street2: address.street2 || '',
                city: address.city,
                state: address.state,
                zip: address.zip,
                country: address.country || 'US',
                phone: address.phone || '',
                email: address.email || '',
                validate: true,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Shipping] Address validation API error: ${response.status} - ${errorText}`);
            return { isValid: false, messages: ['API error during validation'] };
        }

        const data = await response.json();

        // Check validation result
        const isValid = data.validation_results?.is_valid === true;
        const messages = data.validation_results?.messages?.map((m: any) => m.text) || [];

        console.log(`[Shipping] Address validation result: ${isValid ? 'VALID' : 'INVALID'}`);

        return {
            isValid,
            objectId: data.object_id,
            validatedAddress: isValid ? {
                name: data.name,
                street1: data.street1,
                street2: data.street2,
                city: data.city,
                state: data.state,
                zip: data.zip,
                country: data.country,
                phone: data.phone,
                email: data.email,
            } : undefined,
            messages,
        };

    } catch (error: any) {
        console.error(`[Shipping] Address validation error:`, error.message);
        return { isValid: false, messages: [error.message] };
    }
}

/**
 * Get shipping rates for a shipment
 */
export async function getRates(
    fromAddress: ShippoAddress,
    toAddress: ShippoAddress,
    parcel: Parcel
): Promise<{ success: boolean; shipmentId?: string; rates?: ShippingRate[]; error?: string }> {
    if (!SHIPPO_API_KEY) {
        console.log('[Shipping] Shippo API not configured, returning mock rates');
        return {
            success: true,
            shipmentId: 'mock-shipment-id',
            rates: [
                { rateId: 'mock-usps-priority', carrier: 'USPS', carrierAccount: 'mock', servicelevel: { name: 'Priority Mail', token: 'usps_priority' }, amount: '8.50', currency: 'USD', estimatedDays: 2, durationTerms: '1-3 days' },
                { rateId: 'mock-usps-ground', carrier: 'USPS', carrierAccount: 'mock', servicelevel: { name: 'Ground Advantage', token: 'usps_ground_advantage' }, amount: '5.25', currency: 'USD', estimatedDays: 5, durationTerms: '3-5 days' },
                { rateId: 'mock-ups-ground', carrier: 'UPS', carrierAccount: 'mock', servicelevel: { name: 'UPS Ground', token: 'ups_ground' }, amount: '12.00', currency: 'USD', estimatedDays: 5, durationTerms: '1-5 days' },
            ],
        };
    }

    try {
        console.log(`[Shipping] Fetching rates from ${fromAddress.city}, ${fromAddress.state} to ${toAddress.city}, ${toAddress.state}`);

        const response = await fetch(`${SHIPPO_API_URL}/shipments/`, {
            method: 'POST',
            headers: {
                'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                address_from: {
                    name: fromAddress.name,
                    street1: fromAddress.street1,
                    street2: fromAddress.street2 || '',
                    city: fromAddress.city,
                    state: fromAddress.state,
                    zip: fromAddress.zip,
                    country: fromAddress.country || 'US',
                    phone: fromAddress.phone || '',
                    email: fromAddress.email || '',
                },
                address_to: {
                    name: toAddress.name,
                    street1: toAddress.street1,
                    street2: toAddress.street2 || '',
                    city: toAddress.city,
                    state: toAddress.state,
                    zip: toAddress.zip,
                    country: toAddress.country || 'US',
                    phone: toAddress.phone || '',
                    email: toAddress.email || '',
                },
                parcels: [{
                    length: String(parcel.length),
                    width: String(parcel.width),
                    height: String(parcel.height),
                    distance_unit: parcel.distanceUnit || 'in',
                    weight: String(parcel.weight),
                    mass_unit: parcel.massUnit || 'oz',
                }],
                async: false, // Get rates synchronously
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Shipping] Get rates API error: ${response.status} - ${errorText}`);
            return { success: false, error: `API error: ${response.status}` };
        }

        const data = await response.json();

        // Map rates to our format
        const rates: ShippingRate[] = (data.rates || []).map((rate: any) => ({
            rateId: rate.object_id,
            carrier: rate.provider,
            carrierAccount: rate.carrier_account,
            servicelevel: {
                name: rate.servicelevel?.name || 'Standard',
                token: rate.servicelevel?.token || '',
            },
            amount: rate.amount,
            currency: rate.currency,
            estimatedDays: rate.estimated_days,
            durationTerms: rate.duration_terms,
        }));

        console.log(`[Shipping] Got ${rates.length} rates for shipment ${data.object_id}`);

        return {
            success: true,
            shipmentId: data.object_id,
            rates,
        };

    } catch (error: any) {
        console.error(`[Shipping] Get rates error:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Purchase a shipping label using a rate ID
 */
export async function purchaseLabel(rateId: string): Promise<LabelResult> {
    if (!SHIPPO_API_KEY) {
        console.log('[Shipping] Shippo API not configured, returning mock label');
        return {
            success: true,
            transactionId: 'mock-transaction-' + Date.now(),
            trackingNumber: 'MOCK' + Date.now(),
            labelUrl: 'https://shippo-delivery-east.s3.amazonaws.com/mock-label.pdf',
            carrier: 'USPS',
            servicelevel: 'Priority Mail',
        };
    }

    try {
        console.log(`[Shipping] Purchasing label for rate: ${rateId}`);

        const response = await fetch(`${SHIPPO_API_URL}/transactions/`, {
            method: 'POST',
            headers: {
                'Authorization': `ShippoToken ${SHIPPO_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rate: rateId,
                label_file_type: 'PDF',
                async: false,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Shipping] Purchase label API error: ${response.status} - ${errorText}`);
            return { success: false, error: `API error: ${response.status}` };
        }

        const data = await response.json();

        if (data.status !== 'SUCCESS') {
            console.error(`[Shipping] Label purchase failed:`, data.messages);
            return {
                success: false,
                error: data.messages?.map((m: any) => m.text).join(', ') || 'Unknown error',
            };
        }

        console.log(`[Shipping] Label purchased: ${data.tracking_number}`);

        return {
            success: true,
            transactionId: data.object_id,
            trackingNumber: data.tracking_number,
            labelUrl: data.label_url,
            carrier: data.rate?.provider,
            servicelevel: data.rate?.servicelevel?.name,
        };

    } catch (error: any) {
        console.error(`[Shipping] Purchase label error:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create a return label for an existing shipment
 */
export async function createReturnLabel(
    originalFromAddress: ShippoAddress,
    originalToAddress: ShippoAddress,
    parcel: Parcel
): Promise<LabelResult> {
    // Swap from and to for return
    const result = await getRates(originalToAddress, originalFromAddress, parcel);

    if (!result.success || !result.rates || result.rates.length === 0) {
        return { success: false, error: result.error || 'No rates available for return' };
    }

    // Pick cheapest rate
    const cheapestRate = result.rates.reduce((min, rate) =>
        parseFloat(rate.amount) < parseFloat(min.amount) ? rate : min
    );

    return await purchaseLabel(cheapestRate.rateId);
}

/**
 * Store a purchased label in the database
 */
export async function storeLabelRecord(
    tradeId: string,
    userId: number,
    label: LabelResult,
    rateInfo: { carrier: string; servicelevel: string; amountCents: number }
): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO shippo_shipments 
            (trade_id, user_id, shippo_transaction_id, carrier, service_level, amount_cents, label_url, tracking_number, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PURCHASED')`,
            [
                tradeId,
                userId,
                label.transactionId,
                rateInfo.carrier,
                rateInfo.servicelevel,
                rateInfo.amountCents,
                label.labelUrl,
                label.trackingNumber,
            ],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

/**
 * Get label info for a trade/user
 */
export async function getLabelForTrade(tradeId: string, userId: number): Promise<LabelResult | null> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM shippo_shipments WHERE trade_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`,
            [tradeId, userId],
            (err, row: any) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    resolve({
                        success: true,
                        transactionId: row.shippo_transaction_id,
                        trackingNumber: row.tracking_number,
                        labelUrl: row.label_url,
                        carrier: row.carrier,
                        servicelevel: row.service_level,
                    });
                }
            }
        );
    });
}

// Default parcel sizes for common item categories
export const DEFAULT_PARCELS: Record<string, Parcel> = {
    'VIDEO_GAMES': { length: 8, width: 6, height: 2, weight: 8 },
    'TCG': { length: 6, width: 4, height: 1, weight: 4 },
    'SNEAKERS': { length: 14, width: 10, height: 6, weight: 48 },
    'ELECTRONICS': { length: 12, width: 10, height: 4, weight: 32 },
    'OTHER': { length: 10, width: 8, height: 4, weight: 16 },
};
