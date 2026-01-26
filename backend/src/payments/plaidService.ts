/**
 * Plaid Service
 * Handles bank account linking via Plaid Link
 */

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { db } from '../database';

// Configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = (process.env.PLAID_ENV || 'sandbox') as 'sandbox' | 'production';

// Initialize Plaid client
const configuration = PLAID_CLIENT_ID && PLAID_SECRET ? new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
            'PLAID-SECRET': PLAID_SECRET,
        },
    },
}) : null;

const plaidClient = configuration ? new PlaidApi(configuration) : null;

export function isPlaidConfigured(): boolean {
    return plaidClient !== null;
}

/**
 * Create a Link token for Plaid Link initialization
 */
export async function createLinkToken(userId: number): Promise<{ linkToken: string }> {
    if (!plaidClient) {
        throw new Error('Plaid not configured');
    }

    // Get user info for Plaid
    const user = await new Promise<any>((resolve, reject) => {
        db.get('SELECT id, name, email FROM User WHERE id = ?', [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (!user) {
        throw new Error('User not found');
    }

    const response = await plaidClient.linkTokenCreate({
        user: {
            client_user_id: String(userId),
        },
        client_name: 'Leverage',
        products: [Products.Auth],
        country_codes: [CountryCode.Us],
        language: 'en',
    });

    console.log(`[Plaid] Created Link token for user ${userId}`);

    return { linkToken: response.data.link_token };
}

/**
 * Exchange public token for access token and save bank account
 */
export async function exchangePublicToken(
    userId: number,
    publicToken: string,
    metadata: {
        accountId: string;
        accountName: string;
        accountMask: string;
        institutionName: string;
        institutionId: string;
    }
): Promise<{
    id: number;
    provider: string;
    displayName: string;
    lastFour: string;
}> {
    if (!plaidClient) {
        throw new Error('Plaid not configured');
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    console.log(`[Plaid] Exchanged public token for user ${userId}, item ${itemId}`);

    // Build display name
    const displayName = `${metadata.institutionName} ••••${metadata.accountMask}`;
    const now = new Date().toISOString();

    // Check if this is the first payment method (make it default)
    const existingCount = await new Promise<number>((resolve, reject) => {
        db.get(
            'SELECT COUNT(*) as count FROM payment_methods WHERE user_id = ?',
            [userId],
            (err: Error | null, row: any) => {
                if (err) reject(err);
                else resolve(row?.count || 0);
            }
        );
    });

    const isDefault = existingCount === 0 ? 1 : 0;

    // Save to database
    const insertId = await new Promise<number>((resolve, reject) => {
        db.run(
            `INSERT INTO payment_methods 
            (user_id, provider, provider_account_id, display_name, is_default, is_verified, 
             plaid_access_token, plaid_account_id, last_four, connected_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                'stripe_bank', // Use stripe_bank as the provider type for bank accounts
                itemId,
                displayName,
                isDefault,
                1, // Plaid-verified accounts are automatically verified
                accessToken,
                metadata.accountId,
                metadata.accountMask,
                now,
                JSON.stringify({
                    institutionName: metadata.institutionName,
                    institutionId: metadata.institutionId,
                    accountName: metadata.accountName,
                }),
            ],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });

    console.log(`[Plaid] Saved bank account ${insertId} for user ${userId}`);

    return {
        id: insertId,
        provider: 'stripe_bank',
        displayName,
        lastFour: metadata.accountMask,
    };
}

/**
 * Get account balance (for future payout validation)
 */
export async function getAccountBalance(accessToken: string): Promise<{
    available: number | null;
    current: number | null;
}> {
    if (!plaidClient) {
        throw new Error('Plaid not configured');
    }

    const response = await plaidClient.accountsBalanceGet({
        access_token: accessToken,
    });

    const account = response.data.accounts[0];
    return {
        available: account?.balances?.available ?? null,
        current: account?.balances?.current ?? null,
    };
}

/**
 * Delete a Plaid item (disconnect bank)
 */
export async function deletePlaidItem(accessToken: string): Promise<void> {
    if (!plaidClient) {
        throw new Error('Plaid not configured');
    }

    try {
        await plaidClient.itemRemove({
            access_token: accessToken,
        });
        console.log('[Plaid] Item removed successfully');
    } catch (err) {
        console.error('[Plaid] Error removing item:', err);
        // Continue anyway - we still want to delete from our database
    }
}
