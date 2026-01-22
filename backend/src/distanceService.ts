/**
 * Distance calculation utilities using the Haversine formula
 * for calculating the great-circle distance between two points on Earth.
 */

/**
 * Calculate distance between two lat/lng coordinates using Haversine formula
 * @returns Distance in miles
 */
export function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 3959; // Earth's radius in miles (use 6371 for km)

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * Check if a point is within a given distance of another point
 */
export function isWithinDistance(
    lat1: number, lng1: number,
    lat2: number, lng2: number,
    maxDistanceMiles: number
): boolean {
    return calculateDistance(lat1, lng1, lat2, lng2) <= maxDistanceMiles;
}

/**
 * US Zip code to coordinates mapping
 * This is a subset of common zip codes. For production, use a full database.
 * Data source: US Census Bureau / USPS
 */
const ZIP_COORDINATES: Record<string, { lat: number; lng: number; city: string; state: string }> = {
    // Iowa
    '52240': { lat: 41.6611, lng: -91.5302, city: 'Iowa City', state: 'IA' },
    '52241': { lat: 41.6430, lng: -91.5081, city: 'Coralville', state: 'IA' },
    '52242': { lat: 41.6678, lng: -91.5541, city: 'Iowa City', state: 'IA' },
    '50309': { lat: 41.5868, lng: -93.6250, city: 'Des Moines', state: 'IA' },
    '50314': { lat: 41.6066, lng: -93.6327, city: 'Des Moines', state: 'IA' },
    '52402': { lat: 42.0072, lng: -91.6432, city: 'Cedar Rapids', state: 'IA' },

    // Texas
    '78701': { lat: 30.2706, lng: -97.7436, city: 'Austin', state: 'TX' },
    '78702': { lat: 30.2631, lng: -97.7190, city: 'Austin', state: 'TX' },
    '78703': { lat: 30.2956, lng: -97.7641, city: 'Austin', state: 'TX' },
    '75201': { lat: 32.7870, lng: -96.7985, city: 'Dallas', state: 'TX' },
    '77002': { lat: 29.7564, lng: -95.3594, city: 'Houston', state: 'TX' },
    '78205': { lat: 29.4252, lng: -98.4916, city: 'San Antonio', state: 'TX' },

    // California
    '90001': { lat: 33.9425, lng: -118.2551, city: 'Los Angeles', state: 'CA' },
    '90210': { lat: 34.0901, lng: -118.4065, city: 'Beverly Hills', state: 'CA' },
    '94102': { lat: 37.7786, lng: -122.4160, city: 'San Francisco', state: 'CA' },
    '92101': { lat: 32.7194, lng: -117.1628, city: 'San Diego', state: 'CA' },
    '95814': { lat: 38.5816, lng: -121.4944, city: 'Sacramento', state: 'CA' },

    // New York
    '10001': { lat: 40.7484, lng: -73.9967, city: 'New York', state: 'NY' },
    '10019': { lat: 40.7659, lng: -73.9858, city: 'New York', state: 'NY' },
    '11201': { lat: 40.6936, lng: -73.9897, city: 'Brooklyn', state: 'NY' },
    '14201': { lat: 42.8992, lng: -78.8843, city: 'Buffalo', state: 'NY' },

    // Florida
    '33101': { lat: 25.7617, lng: -80.1918, city: 'Miami', state: 'FL' },
    '32801': { lat: 28.5421, lng: -81.3790, city: 'Orlando', state: 'FL' },
    '33602': { lat: 27.9479, lng: -82.4584, city: 'Tampa', state: 'FL' },
    '32301': { lat: 30.4420, lng: -84.2809, city: 'Tallahassee', state: 'FL' },

    // Illinois
    '60601': { lat: 41.8862, lng: -87.6186, city: 'Chicago', state: 'IL' },
    '60602': { lat: 41.8837, lng: -87.6299, city: 'Chicago', state: 'IL' },
    '61801': { lat: 40.1106, lng: -88.2073, city: 'Urbana', state: 'IL' },

    // Other major cities
    '85001': { lat: 33.4484, lng: -112.0740, city: 'Phoenix', state: 'AZ' },
    '19101': { lat: 39.9526, lng: -75.1652, city: 'Philadelphia', state: 'PA' },
    '98101': { lat: 47.6062, lng: -122.3321, city: 'Seattle', state: 'WA' },
    '80202': { lat: 39.7533, lng: -104.9958, city: 'Denver', state: 'CO' },
    '02101': { lat: 42.3601, lng: -71.0589, city: 'Boston', state: 'MA' },
    '20001': { lat: 38.9072, lng: -77.0369, city: 'Washington', state: 'DC' },
    '30301': { lat: 33.7490, lng: -84.3880, city: 'Atlanta', state: 'GA' },
    '48201': { lat: 42.3486, lng: -83.0550, city: 'Detroit', state: 'MI' },
    '55401': { lat: 44.9819, lng: -93.2695, city: 'Minneapolis', state: 'MN' },
    '63101': { lat: 38.6273, lng: -90.1979, city: 'St. Louis', state: 'MO' },
    '97201': { lat: 45.5118, lng: -122.6899, city: 'Portland', state: 'OR' },
    '89101': { lat: 36.1716, lng: -115.1391, city: 'Las Vegas', state: 'NV' },
    '37201': { lat: 36.1627, lng: -86.7816, city: 'Nashville', state: 'TN' },
    '28201': { lat: 35.2271, lng: -80.8431, city: 'Charlotte', state: 'NC' },
    '46201': { lat: 39.7789, lng: -86.1354, city: 'Indianapolis', state: 'IN' },
    '53201': { lat: 43.0389, lng: -87.9065, city: 'Milwaukee', state: 'WI' },
    '64101': { lat: 39.1046, lng: -94.5986, city: 'Kansas City', state: 'MO' },
    '73101': { lat: 35.4676, lng: -97.5164, city: 'Oklahoma City', state: 'OK' },
    '70112': { lat: 29.9511, lng: -90.0715, city: 'New Orleans', state: 'LA' },
    '84101': { lat: 40.7608, lng: -111.8910, city: 'Salt Lake City', state: 'UT' },
    '40201': { lat: 38.2527, lng: -85.7585, city: 'Louisville', state: 'KY' },
    '21201': { lat: 39.2904, lng: -76.6122, city: 'Baltimore', state: 'MD' },
    '06101': { lat: 41.7658, lng: -72.6734, city: 'Hartford', state: 'CT' },
    '87101': { lat: 35.0844, lng: -106.6504, city: 'Albuquerque', state: 'NM' },
    '96801': { lat: 21.3069, lng: -157.8583, city: 'Honolulu', state: 'HI' },
    '99501': { lat: 61.2181, lng: -149.9003, city: 'Anchorage', state: 'AK' },
};

/**
 * Major US city coordinates for fallback when zip code is not available
 */
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    // Format: "city|state" => coordinates
    'iowa city|ia': { lat: 41.6611, lng: -91.5302 },
    'des moines|ia': { lat: 41.5868, lng: -93.6250 },
    'cedar rapids|ia': { lat: 42.0072, lng: -91.6432 },
    'austin|tx': { lat: 30.2672, lng: -97.7431 },
    'dallas|tx': { lat: 32.7767, lng: -96.7970 },
    'houston|tx': { lat: 29.7604, lng: -95.3698 },
    'san antonio|tx': { lat: 29.4241, lng: -98.4936 },
    'los angeles|ca': { lat: 34.0522, lng: -118.2437 },
    'san francisco|ca': { lat: 37.7749, lng: -122.4194 },
    'san diego|ca': { lat: 32.7157, lng: -117.1611 },
    'sacramento|ca': { lat: 38.5816, lng: -121.4944 },
    'new york|ny': { lat: 40.7128, lng: -74.0060 },
    'brooklyn|ny': { lat: 40.6782, lng: -73.9442 },
    'buffalo|ny': { lat: 42.8864, lng: -78.8784 },
    'miami|fl': { lat: 25.7617, lng: -80.1918 },
    'orlando|fl': { lat: 28.5383, lng: -81.3792 },
    'tampa|fl': { lat: 27.9506, lng: -82.4572 },
    'chicago|il': { lat: 41.8781, lng: -87.6298 },
    'phoenix|az': { lat: 33.4484, lng: -112.0740 },
    'philadelphia|pa': { lat: 39.9526, lng: -75.1652 },
    'seattle|wa': { lat: 47.6062, lng: -122.3321 },
    'denver|co': { lat: 39.7392, lng: -104.9903 },
    'boston|ma': { lat: 42.3601, lng: -71.0589 },
    'washington|dc': { lat: 38.9072, lng: -77.0369 },
    'atlanta|ga': { lat: 33.7490, lng: -84.3880 },
    'detroit|mi': { lat: 42.3314, lng: -83.0458 },
    'minneapolis|mn': { lat: 44.9778, lng: -93.2650 },
    'st. louis|mo': { lat: 38.6270, lng: -90.1994 },
    'portland|or': { lat: 45.5152, lng: -122.6784 },
    'las vegas|nv': { lat: 36.1699, lng: -115.1398 },
    'nashville|tn': { lat: 36.1627, lng: -86.7816 },
    'charlotte|nc': { lat: 35.2271, lng: -80.8431 },
    'indianapolis|in': { lat: 39.7684, lng: -86.1581 },
    'milwaukee|wi': { lat: 43.0389, lng: -87.9065 },
    'kansas city|mo': { lat: 39.0997, lng: -94.5786 },
    'oklahoma city|ok': { lat: 35.4676, lng: -97.5164 },
    'new orleans|la': { lat: 29.9511, lng: -90.0715 },
    'salt lake city|ut': { lat: 40.7608, lng: -111.8910 },
    'louisville|ky': { lat: 38.2527, lng: -85.7585 },
    'baltimore|md': { lat: 39.2904, lng: -76.6122 },
    'hartford|ct': { lat: 41.7658, lng: -72.6734 },
    'albuquerque|nm': { lat: 35.0844, lng: -106.6504 },
    'honolulu|hi': { lat: 21.3069, lng: -157.8583 },
    'anchorage|ak': { lat: 61.2181, lng: -149.9003 },
    'coralville|ia': { lat: 41.6430, lng: -91.5081 },
};

export interface Coordinates {
    lat: number;
    lng: number;
}

/**
 * Look up coordinates for a zip code
 */
export function getCoordinatesForZip(zipCode: string): Coordinates | null {
    const data = ZIP_COORDINATES[zipCode];
    return data ? { lat: data.lat, lng: data.lng } : null;
}

/**
 * Look up coordinates for a city/state combination
 */
export function getCoordinatesForCity(city: string, state: string): Coordinates | null {
    const key = `${city.toLowerCase().trim()}|${state.toLowerCase().trim()}`;
    return CITY_COORDINATES[key] || null;
}

/**
 * Get coordinates from either zip code or city/state
 */
export function getCoordinates(
    zipCode?: string | null,
    city?: string | null,
    state?: string | null
): Coordinates | null {
    // Try zip code first (more accurate)
    if (zipCode) {
        const coords = getCoordinatesForZip(zipCode);
        if (coords) return coords;
    }

    // Fall back to city/state lookup
    if (city && state) {
        return getCoordinatesForCity(city, state);
    }

    return null;
}

/**
 * Get zip code data including city and state
 */
export function getZipCodeData(zipCode: string): { lat: number; lng: number; city: string; state: string } | null {
    return ZIP_COORDINATES[zipCode] || null;
}
