import { ExpressAuth } from "@auth/express";
import Google from "@auth/core/providers/google";
import type { AuthConfig } from "@auth/core";
import Database from "better-sqlite3";
import path from "path";

// Create a separate database for auth (or use existing one)
const authDbPath = path.join(__dirname, '../auth.sqlite');
console.log('[Auth] Initializing auth database at:', authDbPath);
const authDb = new Database(authDbPath);

// Create tables for Auth.js
console.log('[Auth] Creating auth tables...');
authDb.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        providerAccountId TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        UNIQUE(provider, providerAccountId)
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        sessionToken TEXT UNIQUE NOT NULL,
        userId TEXT NOT NULL,
        expires TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires TEXT NOT NULL,
        PRIMARY KEY (identifier, token)
    );

    CREATE TABLE IF NOT EXISTS oauth_users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        emailVerified TEXT,
        image TEXT,
        leverage_user_id INTEGER
    );
`);

// Custom SQLite adapter for Auth.js
// Helper function to get user by ID (extracted to avoid 'this' binding issues)
function getUserById(id: string) {
    const user = authDb.prepare('SELECT * FROM oauth_users WHERE id = ?').get(id) as any;
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
        image: user.image,
        leverageUserId: user.leverage_user_id,
    };
}

const sqliteAdapter = {
    async createUser(user: any) {
        const id = crypto.randomUUID();
        authDb.prepare(`
            INSERT INTO oauth_users (id, name, email, emailVerified, image)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, user.name, user.email, user.emailVerified?.toISOString() || null, user.image);
        return { ...user, id };
    },

    async getUser(id: string) {
        return getUserById(id);
    },

    async getUserByEmail(email: string) {
        const user = authDb.prepare('SELECT * FROM oauth_users WHERE email = ?').get(email) as any;
        if (!user) return null;
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
            image: user.image,
            leverageUserId: user.leverage_user_id,
        };
    },

    async getUserByAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }) {
        const account = authDb.prepare(
            'SELECT * FROM accounts WHERE provider = ? AND providerAccountId = ?'
        ).get(provider, providerAccountId) as any;
        if (!account) return null;
        return getUserById(account.userId);
    },

    async updateUser(user: any) {
        authDb.prepare(`
            UPDATE oauth_users SET name = ?, email = ?, emailVerified = ?, image = ?
            WHERE id = ?
        `).run(user.name, user.email, user.emailVerified?.toISOString() || null, user.image, user.id);
        return user;
    },

    async deleteUser(userId: string) {
        authDb.prepare('DELETE FROM oauth_users WHERE id = ?').run(userId);
    },

    async linkAccount(account: any) {
        const id = crypto.randomUUID();
        authDb.prepare(`
            INSERT INTO accounts (id, userId, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            account.userId,
            account.type,
            account.provider,
            account.providerAccountId,
            account.refresh_token || null,
            account.access_token || null,
            account.expires_at || null,
            account.token_type || null,
            account.scope || null,
            account.id_token || null,
            account.session_state || null
        );
        return account;
    },

    async unlinkAccount({ providerAccountId, provider }: { providerAccountId: string; provider: string }) {
        authDb.prepare(
            'DELETE FROM accounts WHERE provider = ? AND providerAccountId = ?'
        ).run(provider, providerAccountId);
    },

    async createSession(session: any) {
        const id = crypto.randomUUID();
        authDb.prepare(`
            INSERT INTO sessions (id, sessionToken, userId, expires)
            VALUES (?, ?, ?, ?)
        `).run(id, session.sessionToken, session.userId, session.expires.toISOString());
        return session;
    },

    async getSessionAndUser(sessionToken: string) {
        const session = authDb.prepare(
            'SELECT * FROM sessions WHERE sessionToken = ?'
        ).get(sessionToken) as any;
        if (!session) return null;
        const user = getUserById(session.userId);
        if (!user) return null;
        return {
            session: {
                id: session.id,
                sessionToken: session.sessionToken,
                userId: session.userId,
                expires: new Date(session.expires),
            },
            user,
        };
    },

    async updateSession(session: any) {
        authDb.prepare(`
            UPDATE sessions SET expires = ? WHERE sessionToken = ?
        `).run(session.expires.toISOString(), session.sessionToken);
        return session;
    },

    async deleteSession(sessionToken: string) {
        authDb.prepare('DELETE FROM sessions WHERE sessionToken = ?').run(sessionToken);
    },

    async createVerificationToken(token: any) {
        authDb.prepare(`
            INSERT INTO verification_tokens (identifier, token, expires)
            VALUES (?, ?, ?)
        `).run(token.identifier, token.token, token.expires.toISOString());
        return token;
    },

    async useVerificationToken({ identifier, token }: { identifier: string; token: string }) {
        const row = authDb.prepare(
            'SELECT * FROM verification_tokens WHERE identifier = ? AND token = ?'
        ).get(identifier, token) as any;
        if (!row) return null;
        authDb.prepare(
            'DELETE FROM verification_tokens WHERE identifier = ? AND token = ?'
        ).run(identifier, token);
        return {
            identifier: row.identifier,
            token: row.token,
            expires: new Date(row.expires),
        };
    },
};

// Validate OAuth credentials
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

if (!googleClientId || googleClientId === 'your-google-client-id' || googleClientId === 'your_google_client_id_here') {
    console.warn('[Auth] ⚠️  GOOGLE_CLIENT_ID is not configured. OAuth sign-in will not work.');
    console.warn('[Auth]    To enable Google sign-in:');
    console.warn('[Auth]    1. Go to https://console.cloud.google.com/apis/credentials');
    console.warn('[Auth]    2. Create OAuth 2.0 Client ID (Web application)');
    console.warn('[Auth]    3. Add redirect URI: http://localhost:4000/api/auth/callback/google');
    console.warn('[Auth]    4. Copy credentials to backend/.env file');
} else {
    console.log('[Auth] ✅ Google OAuth credentials configured');
}

// Auth.js configuration
export const authConfig: AuthConfig = {
    adapter: sqliteAdapter as any,
    providers: [
        Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
        }),
    ],
    secret: process.env.AUTH_SECRET || 'development-secret-change-in-production',
    trustHost: true,
    debug: process.env.AUTH_DEBUG === 'true',
    callbacks: {
        async session({ session, user }: any) {
            // Add leverage user ID to session if linked
            if (user && user.leverageUserId) {
                session.leverageUserId = user.leverageUserId;
            }
            return session;
        },
        async signIn({ user, account, profile }: any) {
            console.log('[Auth] Sign-in attempt:', { provider: account?.provider, email: user?.email });
            // Auto-link to existing Leverage user by email
            if (account?.provider === 'google' && user?.email) {
                const existingOAuthUser = authDb.prepare(
                    'SELECT * FROM oauth_users WHERE email = ?'
                ).get(user.email) as any;

                if (existingOAuthUser && !existingOAuthUser.leverage_user_id) {
                    // Check if there's a Leverage user with this email
                    // This would need access to the main db - for now just allow sign in
                    console.log('[Auth] Existing OAuth user found, no Leverage link yet');
                }
            }
            return true;
        },
        async redirect({ url, baseUrl }: any) {
            // Always redirect to the frontend after auth
            console.log('[Auth] Redirect callback:', { url, baseUrl });
            return 'http://localhost:3000/';
        },
    },
};

// Export the Express middleware
export const authHandler = ExpressAuth(authConfig);

// Export the auth database for linking users
export { authDb };

// Export a function to check if OAuth is properly configured
export function isOAuthConfigured(): boolean {
    return googleClientId !== '' &&
        googleClientId !== 'your-google-client-id' &&
        googleClientId !== 'your_google_client_id_here';
}
