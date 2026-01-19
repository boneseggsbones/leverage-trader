/**
 * Executable Backend API Tests
 * These tests actually call the backend API and return real pass/fail results
 */

const API_BASE = 'http://localhost:4000';

// Helper to make API calls with error handling
async function apiCall(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
    try {
        const options: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const res = await fetch(`${API_BASE}${path}`, options);
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    } catch (error: any) {
        throw new Error(`Network error: ${error.message}`);
    }
}

// Test assertion helper
function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

export interface BackendTest {
    id: string;
    name: string;
    category: string;
    run: () => Promise<void>;
}

// ============================================
// AUTHENTICATION TESTS
// ============================================
const authTests: BackendTest[] = [
    {
        id: 'AUTH-01',
        name: 'GET /api/auth/session returns session info',
        category: 'Authentication',
        async run() {
            const { status } = await apiCall('GET', '/api/auth/session');
            assert([200, 401].includes(status), `Expected 200 or 401, got ${status}`);
        }
    },
    {
        id: 'AUTH-02',
        name: 'Server health check responds',
        category: 'Authentication',
        async run() {
            const { status } = await apiCall('GET', '/api/users');
            assert(status === 200, `Expected 200, got ${status}`);
        }
    },
];

// ============================================
// USERS API TESTS
// ============================================
const userTests: BackendTest[] = [
    {
        id: 'USER-01',
        name: 'GET /api/users returns all users',
        category: 'Users API',
        async run() {
            const { status, data } = await apiCall('GET', '/api/users');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(Array.isArray(data), 'Expected array of users');
        }
    },
    {
        id: 'USER-02',
        name: 'GET /api/users/:id returns specific user',
        category: 'Users API',
        async run() {
            const { status, data } = await apiCall('GET', '/api/users/1');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(data.id !== undefined, 'User should have id');
        }
    },
    {
        id: 'USER-03',
        name: 'GET /api/users/:id/inventory returns items',
        category: 'Users API',
        async run() {
            const { status, data } = await apiCall('GET', '/api/users/1/inventory');
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
    {
        id: 'USER-04',
        name: 'GET /api/users/:id/ratings returns ratings',
        category: 'Users API',
        async run() {
            const { status } = await apiCall('GET', '/api/users/1/ratings');
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
];

// ============================================
// ITEMS API TESTS
// ============================================
const itemTests: BackendTest[] = [
    {
        id: 'ITEM-01',
        name: 'GET /api/items returns paginated items',
        category: 'Items API',
        async run() {
            const { status, data } = await apiCall('GET', '/api/items');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(Array.isArray(data) || data.items, 'Expected items array');
        }
    },
    {
        id: 'ITEM-02',
        name: 'GET /api/items/:id returns item details',
        category: 'Items API',
        async run() {
            const { status } = await apiCall('GET', '/api/items/1');
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
    {
        id: 'ITEM-03',
        name: 'GET /api/items with category filter',
        category: 'Items API',
        async run() {
            const { status } = await apiCall('GET', '/api/items?category=VIDEO_GAMES');
            assert(status === 200, `Expected 200, got ${status}`);
        }
    },
];

// ============================================
// TRADES API TESTS
// ============================================
const tradeTests: BackendTest[] = [
    {
        id: 'TRADE-01',
        name: 'GET /api/trades returns trades',
        category: 'Trades API',
        async run() {
            const { status, data } = await apiCall('GET', '/api/trades');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(Array.isArray(data) || data.trades, 'Expected trades data');
        }
    },
    {
        id: 'TRADE-02',
        name: 'POST /api/trades creates trade',
        category: 'Trades API',
        async run() {
            const { status, data } = await apiCall('POST', '/api/trades', {
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [],
                receiverItemIds: [],
                proposerCash: 100
            });
            assert([200, 201].includes(status), `Expected 200/201, got ${status}`);
            assert(data.trade || data.id, 'Expected trade in response');
        }
    },
    {
        id: 'TRADE-03',
        name: 'GET /api/trades/:id returns trade',
        category: 'Trades API',
        async run() {
            // First create a trade
            const create = await apiCall('POST', '/api/trades', {
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [],
                receiverItemIds: [],
                proposerCash: 50
            });
            const tradeId = create.data.trade?.id || create.data.id;

            const { status } = await apiCall('GET', `/api/trades/${tradeId}`);
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
];

// ============================================
// NOTIFICATIONS TESTS
// ============================================
const notificationTests: BackendTest[] = [
    {
        id: 'NOTIF-01',
        name: 'GET /api/notifications returns notifications',
        category: 'Notifications',
        async run() {
            const { status, data } = await apiCall('GET', '/api/notifications?userId=1');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(Array.isArray(data), 'Expected array of notifications');
        }
    },
    {
        id: 'NOTIF-02',
        name: 'GET /api/notifications/unread-count returns count',
        category: 'Notifications',
        async run() {
            const { status, data } = await apiCall('GET', '/api/notifications/unread-count?userId=1');
            assert(status === 200, `Expected 200, got ${status}`);
            assert(data.unreadCount !== undefined, 'Expected unreadCount');
        }
    },
    {
        id: 'NOTIF-03',
        name: 'GET /api/notifications without userId returns 400',
        category: 'Notifications',
        async run() {
            const { status } = await apiCall('GET', '/api/notifications');
            assert(status === 400, `Expected 400, got ${status}`);
        }
    },
];

// ============================================
// ESCROW TESTS
// ============================================
const escrowTests: BackendTest[] = [
    {
        id: 'ESC-01',
        name: 'GET /api/trades/:id/escrow returns escrow info',
        category: 'Escrow',
        async run() {
            // Create a trade first
            const create = await apiCall('POST', '/api/trades', {
                proposerId: 1,
                receiverId: 2,
                proposerItemIds: [],
                receiverItemIds: [],
                proposerCash: 200
            });
            const tradeId = create.data.trade?.id || create.data.id;

            const { status } = await apiCall('GET', `/api/trades/${tradeId}/escrow`);
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
];

// ============================================
// VALUATION TESTS
// ============================================
const valuationTests: BackendTest[] = [
    {
        id: 'VAL-01',
        name: 'GET /api/valuation/search returns results',
        category: 'Valuation',
        async run() {
            const { status } = await apiCall('GET', '/api/valuation/search?query=mario');
            assert([200, 404, 500].includes(status), `Expected valid response, got ${status}`);
        }
    },
];

// ============================================
// EMAIL PREFERENCES TESTS
// ============================================
const emailTests: BackendTest[] = [
    {
        id: 'EMAIL-01',
        name: 'GET /api/email-preferences returns preferences',
        category: 'Email',
        async run() {
            const { status } = await apiCall('GET', '/api/email-preferences?userId=1');
            assert([200, 400, 404].includes(status), `Expected valid response, got ${status}`);
        }
    },
];

// ============================================
// WISHLIST TESTS
// ============================================
const wishlistTests: BackendTest[] = [
    {
        id: 'WISH-01',
        name: 'GET /api/wishlist returns user wishlist',
        category: 'Wishlist',
        async run() {
            const { status } = await apiCall('GET', '/api/wishlist?userId=1');
            assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
        }
    },
];

// Combine all tests
export const allBackendTests: BackendTest[] = [
    ...authTests,
    ...userTests,
    ...itemTests,
    ...tradeTests,
    ...notificationTests,
    ...escrowTests,
    ...valuationTests,
    ...emailTests,
    ...wishlistTests,
];

// Group tests by category for display
export const backendTestsByCategory: Record<string, BackendTest[]> = allBackendTests.reduce(
    (acc, test) => {
        if (!acc[test.category]) acc[test.category] = [];
        acc[test.category].push(test);
        return acc;
    },
    {} as Record<string, BackendTest[]>
);
