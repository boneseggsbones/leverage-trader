/**
 * Location utilities for normalizing city and state data
 */

// US State name to abbreviation mapping
const STATE_ABBREVIATIONS: Record<string, string> = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
    'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
    'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
};

// Valid state abbreviations for validation
const VALID_ABBREVIATIONS = new Set(Object.values(STATE_ABBREVIATIONS));

/**
 * Normalize a state input to a 2-letter abbreviation (uppercase)
 * Accepts full state names or abbreviations in any case
 */
export function normalizeState(state: string | null | undefined): string {
    if (!state) return '';

    const trimmed = state.trim();
    const lower = trimmed.toLowerCase();

    // If it's already a valid abbreviation, just uppercase it
    if (trimmed.length === 2 && VALID_ABBREVIATIONS.has(trimmed.toUpperCase())) {
        return trimmed.toUpperCase();
    }

    // Look up full state name
    const abbrev = STATE_ABBREVIATIONS[lower];
    if (abbrev) return abbrev;

    // Last resort: return whatever was passed (uppercase if short)
    return trimmed.length <= 3 ? trimmed.toUpperCase() : trimmed;
}

/**
 * Normalize a city name to Title Case for display consistency
 * Stores as proper case: "Iowa City" not "iowa city" or "IOWA CITY"
 */
export function normalizeCity(city: string | null | undefined): string {
    if (!city) return '';

    return city.trim()
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Normalize both city and state for storage
 */
export function normalizeLocation(city: string | null | undefined, state: string | null | undefined): { city: string; state: string } {
    return {
        city: normalizeCity(city),
        state: normalizeState(state)
    };
}

/**
 * Compare two locations for equality (case-insensitive)
 */
export function locationsMatch(
    city1: string | null | undefined,
    state1: string | null | undefined,
    city2: string | null | undefined,
    state2: string | null | undefined
): boolean {
    const norm1 = normalizeLocation(city1, state1);
    const norm2 = normalizeLocation(city2, state2);

    return norm1.city.toLowerCase() === norm2.city.toLowerCase() &&
        norm1.state === norm2.state;
}
