/**
 * PSA (Professional Sports Authenticator) API Service
 * 
 * Provides certification verification and grade data for graded collectibles.
 * Uses OAuth 2.0 for authentication with PSA credentials.
 * 
 * API Documentation: https://api.psacard.com/publicapi/
 * Rate Limit: 100 calls/day on free tier
 */

import { db } from './database';

// === Types ===

export interface PSACertData {
    certNumber: string;
    grade: string;
    gradeDescription: string;
    qualifier?: string;          // e.g., "OC" for off-center
    labelType: string;           // Regular, Dual, Authentic
    year?: string;
    brand?: string;
    setName?: string;
    cardNumber?: string;
    subject?: string;            // Player/character name
    variety?: string;
    population: number;          // How many at this grade
    populationHigher: number;    // How many graded higher
    verified: boolean;
    lastChecked: Date;
}

export interface PSAPopulationData {
    grade: string;
    count: number;
    total: number;               // Total graded at all grades
    percentOfTotal: number;
}

interface OAuthToken {
    accessToken: string;
    expiresAt: Date;
}

// === Configuration ===

const PSA_AUTH_URL = 'https://api.psacard.com/publicapi/oauth/token';
const PSA_API_BASE = 'https://api.psacard.com/publicapi/cert';

// Get credentials from environment
const PSA_USERNAME = process.env.PSA_USERNAME || '';
const PSA_PASSWORD = process.env.PSA_PASSWORD || '';

// In-memory token cache
let cachedToken: OAuthToken | null = null;

// Rate limit tracking (100/day)
let dailyCalls = 0;
let lastResetDate = new Date().toDateString();

// === Helper Functions ===

/**
 * Check if PSA API is configured
 */
export const isPsaConfigured = (): boolean => {
    return PSA_USERNAME.length > 0 && PSA_PASSWORD.length > 0;
};

/**
 * Check if we're within rate limits
 */
export const canMakeApiCall = (): boolean => {
    // Reset counter at midnight
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        dailyCalls = 0;
        lastResetDate = today;
    }
    return dailyCalls < 100;
};

/**
 * Get remaining API calls for today
 */
export const getRemainingCalls = (): number => {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        return 100;
    }
    return Math.max(0, 100 - dailyCalls);
};

/**
 * Get OAuth access token
 */
const getAccessToken = async (): Promise<string | null> => {
    // Return cached token if still valid
    if (cachedToken && cachedToken.expiresAt > new Date()) {
        return cachedToken.accessToken;
    }

    if (!isPsaConfigured()) {
        console.log('[PSA] API not configured - missing credentials');
        return null;
    }

    try {
        const response = await fetch(PSA_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'password',
                username: PSA_USERNAME,
                password: PSA_PASSWORD,
            }),
        });

        if (!response.ok) {
            console.error('[PSA] OAuth failed:', response.status);
            return null;
        }

        const data = await response.json();

        // Cache the token (expires_in is in seconds)
        const expiresIn = data.expires_in || 3600;
        cachedToken = {
            accessToken: data.access_token,
            expiresAt: new Date(Date.now() + (expiresIn - 60) * 1000), // 1 min buffer
        };

        console.log('[PSA] OAuth token obtained, expires in', expiresIn, 'seconds');
        return cachedToken.accessToken;
    } catch (error) {
        console.error('[PSA] OAuth error:', error);
        return null;
    }
};

// === Core API Functions ===

/**
 * Verify a PSA certification by cert number
 * Returns full certification data if valid
 */
export const verifyCertification = async (certNumber: string): Promise<PSACertData | null> => {
    // Check cache first
    const cached = await getCachedCertData(certNumber);
    if (cached) {
        console.log('[PSA] Returning cached cert data for', certNumber);
        return cached;
    }

    // Check rate limit
    if (!canMakeApiCall()) {
        console.warn('[PSA] Rate limit reached (100/day)');
        return null;
    }

    const token = await getAccessToken();
    if (!token) {
        return null;
    }

    try {
        dailyCalls++;
        console.log(`[PSA] API call ${dailyCalls}/100 - verifying cert ${certNumber}`);

        const response = await fetch(`${PSA_API_BASE}/GetByCertNumber/${certNumber}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                console.log('[PSA] Cert not found:', certNumber);
                return null;
            }
            console.error('[PSA] API error:', response.status);
            return null;
        }

        const data = await response.json();

        // Parse the PSA response into our format
        const certData: PSACertData = {
            certNumber: data.PSACert?.CertNumber || certNumber,
            grade: data.PSACert?.CardGrade || 'N/A',
            gradeDescription: getGradeDescription(data.PSACert?.CardGrade),
            qualifier: data.PSACert?.Qualifier || undefined,
            labelType: data.PSACert?.LabelType || 'Regular',
            year: data.PSACert?.Year?.toString() || undefined,
            brand: data.PSACert?.Brand || undefined,
            setName: data.PSACert?.SetName || undefined,
            cardNumber: data.PSACert?.CardNumber || undefined,
            subject: data.PSACert?.Subject || undefined,
            variety: data.PSACert?.Variety || undefined,
            population: data.PSACert?.PopulationCount || 0,
            populationHigher: data.PSACert?.PopHigher || 0,
            verified: true,
            lastChecked: new Date(),
        };

        // Cache the result
        await cacheCertData(certData);

        return certData;
    } catch (error) {
        console.error('[PSA] Verification error:', error);
        return null;
    }
};

/**
 * Get grade description from numeric grade
 */
const getGradeDescription = (grade: string): string => {
    const descriptions: Record<string, string> = {
        '10': 'Gem Mint',
        '9': 'Mint',
        '8': 'Near Mint-Mint',
        '7': 'Near Mint',
        '6': 'Excellent-Mint',
        '5': 'Excellent',
        '4': 'Very Good-Excellent',
        '3': 'Very Good',
        '2': 'Good',
        '1.5': 'Fair',
        '1': 'Poor',
        'AUTH': 'Authentic (Ungraded)',
    };
    return descriptions[grade] || grade;
};

/**
 * Get price multiplier for PSA grade
 * Based on typical market premiums for graded vs raw cards
 * PSA 10 commands highest premium; lower grades may actually be below raw value
 */
export const getGradeMultiplier = (grade: string): number => {
    const multipliers: Record<string, number> = {
        '10': 3.0,    // Gem Mint - 3x raw price
        '9': 1.8,     // Mint - 1.8x raw price  
        '8': 1.4,     // Near Mint-Mint - 1.4x raw price
        '7': 1.2,     // Near Mint - 1.2x raw price
        '6': 1.0,     // Excellent-Mint - same as raw
        '5': 0.9,     // Excellent - slightly below raw
        '4': 0.8,     // Very Good-Excellent
        '3': 0.7,     // Very Good
        '2': 0.5,     // Good
        '1.5': 0.4,   // Fair
        '1': 0.3,     // Poor
        'AUTH': 1.0,  // Authentic but ungraded
    };
    return multipliers[grade] || 1.0;
};

// === Database Cache Functions ===

/**
 * Get cached certification data
 */
const getCachedCertData = async (certNumber: string): Promise<PSACertData | null> => {
    return new Promise((resolve) => {
        // Cache for 7 days (population can change, but not frequently)
        const maxAge = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        db.get(
            `SELECT * FROM psa_certifications 
             WHERE cert_number = ? AND last_checked > ?`,
            [certNumber, maxAge],
            (err: Error | null, row: any) => {
                if (err || !row) {
                    resolve(null);
                    return;
                }

                resolve({
                    certNumber: row.cert_number,
                    grade: row.grade,
                    gradeDescription: row.grade_description,
                    qualifier: row.qualifier || undefined,
                    labelType: row.label_type,
                    year: row.year || undefined,
                    brand: row.brand || undefined,
                    setName: row.set_name || undefined,
                    cardNumber: row.card_number || undefined,
                    subject: row.subject || undefined,
                    variety: row.variety || undefined,
                    population: row.population,
                    populationHigher: row.population_higher,
                    verified: true,
                    lastChecked: new Date(row.last_checked),
                });
            }
        );
    });
};

/**
 * Cache certification data
 */
const cacheCertData = async (data: PSACertData): Promise<void> => {
    return new Promise((resolve) => {
        db.run(
            `INSERT OR REPLACE INTO psa_certifications 
             (cert_number, grade, grade_description, qualifier, label_type,
              year, brand, set_name, card_number, subject, variety,
              population, population_higher, last_checked)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.certNumber,
                data.grade,
                data.gradeDescription,
                data.qualifier || null,
                data.labelType,
                data.year || null,
                data.brand || null,
                data.setName || null,
                data.cardNumber || null,
                data.subject || null,
                data.variety || null,
                data.population,
                data.populationHigher,
                data.lastChecked.toISOString(),
            ],
            (err: Error | null) => {
                if (err) {
                    console.error('[PSA] Cache error:', err);
                }
                resolve();
            }
        );
    });
};

// === Item Linking ===

/**
 * Link an item to a PSA certification
 */
export const linkItemToPSA = async (
    itemId: number,
    certNumber: string
): Promise<{ success: boolean; certData?: PSACertData; message: string; newPrice?: number }> => {
    // Verify the cert first
    const certData = await verifyCertification(certNumber);

    if (!certData) {
        return {
            success: false,
            message: isPsaConfigured()
                ? 'Certification not found or API error'
                : 'PSA API not configured',
        };
    }

    return new Promise((resolve) => {
        // First get the current item value
        db.get(
            'SELECT estimatedMarketValue FROM Item WHERE id = ?',
            [itemId],
            (err: Error | null, row: any) => {
                if (err || !row) {
                    resolve({ success: false, message: 'Item not found' });
                    return;
                }

                // Calculate new price based on grade multiplier
                const currentValue = row.estimatedMarketValue || 0;
                const multiplier = getGradeMultiplier(certData.grade);
                const newValue = Math.round(currentValue * multiplier);

                // Update the item with PSA data and adjusted price
                db.run(
                    `UPDATE Item SET 
                     psa_cert_number = ?,
                     psa_grade = ?,
                     condition = 'GRADED',
                     estimatedMarketValue = ?,
                     emv_source = 'api',
                     emv_confidence = 90
                     WHERE id = ?`,
                    [certNumber, certData.grade, newValue, itemId],
                    (updateErr: Error | null) => {
                        if (updateErr) {
                            resolve({ success: false, message: updateErr.message });
                            return;
                        }

                        const priceChange = multiplier !== 1.0
                            ? ` Price adjusted ${multiplier > 1 ? '+' : ''}${Math.round((multiplier - 1) * 100)}% for grade.`
                            : '';

                        resolve({
                            success: true,
                            certData,
                            newPrice: newValue,
                            message: `Linked to PSA ${certData.grade} (Pop ${certData.population}).${priceChange}`,
                        });
                    }
                );
            }
        );
    });
};

/**
 * Get PSA data for an item if it has a linked certification
 */
export const getItemPSAData = async (itemId: number): Promise<PSACertData | null> => {
    return new Promise((resolve) => {
        db.get(
            'SELECT psa_cert_number FROM Item WHERE id = ?',
            [itemId],
            async (err: Error | null, row: any) => {
                if (err || !row?.psa_cert_number) {
                    resolve(null);
                    return;
                }

                const certData = await verifyCertification(row.psa_cert_number);
                resolve(certData);
            }
        );
    });
};

// === Exports for testing ===
export { getAccessToken as _getAccessToken };
