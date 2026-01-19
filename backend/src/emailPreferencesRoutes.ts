/**
 * Email Preferences Routes
 * API endpoints for managing user email notification preferences
 */

import { Router } from 'express';
import { db } from './database';

const router = Router();

// Preference fields that map to notification types
const PREFERENCE_FIELDS = [
    'trade_proposed',
    'trade_accepted',
    'escrow_funded',
    'trade_completed',
    'counter_offer',
    'dispute_opened',
] as const;

type PreferenceField = typeof PREFERENCE_FIELDS[number];

export interface EmailPreferences {
    userId: number;
    tradeProposed: boolean;
    tradeAccepted: boolean;
    escrowFunded: boolean;
    tradeCompleted: boolean;
    counterOffer: boolean;
    disputeOpened: boolean;
}

/**
 * Ensure preferences row exists for user (with defaults)
 */
function ensurePreferencesExist(userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR IGNORE INTO email_preferences (user_id) VALUES (?)`,
            [userId],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

/**
 * GET /api/email-preferences/:userId
 * Get email notification preferences for a user
 */
router.get('/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        await ensurePreferencesExist(userId);

        db.get(
            'SELECT * FROM email_preferences WHERE user_id = ?',
            [userId],
            (err, row: any) => {
                if (err) {
                    console.error('[EmailPreferences] Error fetching:', err);
                    return res.status(500).json({ error: err.message });
                }

                const preferences: EmailPreferences = {
                    userId,
                    tradeProposed: row?.trade_proposed === 1,
                    tradeAccepted: row?.trade_accepted === 1,
                    escrowFunded: row?.escrow_funded === 1,
                    tradeCompleted: row?.trade_completed === 1,
                    counterOffer: row?.counter_offer === 1,
                    disputeOpened: row?.dispute_opened === 1,
                };

                res.json(preferences);
            }
        );
    } catch (err: any) {
        console.error('[EmailPreferences] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/email-preferences/:userId
 * Update email notification preferences for a user
 */
router.put('/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    const {
        tradeProposed,
        tradeAccepted,
        escrowFunded,
        tradeCompleted,
        counterOffer,
        disputeOpened,
    } = req.body;

    try {
        await ensurePreferencesExist(userId);

        const updates: string[] = [];
        const values: any[] = [];

        if (typeof tradeProposed === 'boolean') {
            updates.push('trade_proposed = ?');
            values.push(tradeProposed ? 1 : 0);
        }
        if (typeof tradeAccepted === 'boolean') {
            updates.push('trade_accepted = ?');
            values.push(tradeAccepted ? 1 : 0);
        }
        if (typeof escrowFunded === 'boolean') {
            updates.push('escrow_funded = ?');
            values.push(escrowFunded ? 1 : 0);
        }
        if (typeof tradeCompleted === 'boolean') {
            updates.push('trade_completed = ?');
            values.push(tradeCompleted ? 1 : 0);
        }
        if (typeof counterOffer === 'boolean') {
            updates.push('counter_offer = ?');
            values.push(counterOffer ? 1 : 0);
        }
        if (typeof disputeOpened === 'boolean') {
            updates.push('dispute_opened = ?');
            values.push(disputeOpened ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid preferences provided' });
        }

        updates.push("updated_at = datetime('now')");
        values.push(userId);

        db.run(
            `UPDATE email_preferences SET ${updates.join(', ')} WHERE user_id = ?`,
            values,
            function (err) {
                if (err) {
                    console.error('[EmailPreferences] Error updating:', err);
                    return res.status(500).json({ error: err.message });
                }

                console.log(`[EmailPreferences] Updated preferences for user ${userId}`);
                res.json({ success: true, userId });
            }
        );
    } catch (err: any) {
        console.error('[EmailPreferences] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Check if email should be sent for a specific notification type
 * Returns true if user has that notification type enabled (or no preferences set = defaults to enabled)
 */
export async function shouldSendEmailForType(
    userId: number,
    notificationType: string
): Promise<boolean> {
    // Map notification types to preference fields
    const typeToField: Record<string, PreferenceField> = {
        TRADE_PROPOSED: 'trade_proposed',
        TRADE_ACCEPTED: 'trade_accepted',
        ESCROW_FUNDED: 'escrow_funded',
        TRADE_COMPLETED: 'trade_completed',
        COUNTER_OFFER: 'counter_offer',
        DISPUTE_OPENED: 'dispute_opened',
    };

    const field = typeToField[notificationType];
    if (!field) {
        // Not a configurable type, default to send
        return true;
    }

    return new Promise((resolve) => {
        db.get(
            `SELECT ${field} as enabled FROM email_preferences WHERE user_id = ?`,
            [userId],
            (err, row: any) => {
                if (err || !row) {
                    // No preferences set, default to enabled
                    resolve(true);
                } else {
                    resolve(row.enabled === 1);
                }
            }
        );
    });
}

export default router;
