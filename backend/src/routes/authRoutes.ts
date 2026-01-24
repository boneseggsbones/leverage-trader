import { Router } from 'express';
import { db } from '../database';
import { authHandler, authDb, isOAuthConfigured } from '../auth';

const router = Router();

// Mount Auth.js routes
router.use('/auth/*', authHandler);

// Check OAuth configuration status
router.get('/auth-status', (req, res) => {
    res.json({
        googleConfigured: isOAuthConfigured(),
        providers: ['google'],
        message: isOAuthConfigured()
            ? 'OAuth is properly configured'
            : 'Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env'
    });
});

// Get current user from OAuth session (creates Leverage user if needed)
router.get('/session', async (req, res) => {
    try {
        // Get session token from cookie
        const sessionToken = req.cookies?.['authjs.session-token'] || req.cookies?.['__Secure-authjs.session-token'];

        if (!sessionToken) {
            return res.json({ user: null });
        }

        // Look up session in auth database
        const session = authDb.prepare('SELECT * FROM sessions WHERE sessionToken = ?').get(sessionToken) as any;
        if (!session || new Date(session.expires) < new Date()) {
            return res.json({ user: null });
        }

        // Get OAuth user
        const oauthUser = authDb.prepare('SELECT * FROM oauth_users WHERE id = ?').get(session.userId) as any;
        if (!oauthUser) {
            return res.json({ user: null });
        }

        // Check if linked to Leverage user
        if (oauthUser.leverage_user_id) {
            // Return existing Leverage user
            db.get('SELECT * FROM User WHERE id = ?', [oauthUser.leverage_user_id], (err: Error | null, row: any) => {
                if (err || !row) {
                    return res.json({ user: null });
                }
                // Fetch inventory
                db.all('SELECT * FROM Item WHERE owner_id = ?', [row.id], (err: Error | null, items: any[]) => {
                    res.json({
                        user: { ...row, inventory: items || [] },
                        oauthUser: { email: oauthUser.email, name: oauthUser.name, image: oauthUser.image }
                    });
                });
            });
        } else {
            // Check if there's an existing Leverage user with this email
            db.get('SELECT * FROM User WHERE email = ?', [oauthUser.email], (err: Error | null, existingUser: any) => {
                if (existingUser) {
                    // Link the accounts
                    authDb.prepare('UPDATE oauth_users SET leverage_user_id = ? WHERE id = ?').run(existingUser.id, oauthUser.id);
                    db.all('SELECT * FROM Item WHERE owner_id = ?', [existingUser.id], (err: Error | null, items: any[]) => {
                        res.json({
                            user: { ...existingUser, inventory: items || [] },
                            oauthUser: { email: oauthUser.email, name: oauthUser.name, image: oauthUser.image }
                        });
                    });
                } else {
                    // Create a new Leverage user
                    const newUserName = oauthUser.name || oauthUser.email.split('@')[0];
                    db.run(
                        'INSERT INTO User (name, email, rating, balance) VALUES (?, ?, ?, ?)',
                        [newUserName, oauthUser.email, 5, 0],
                        function (err: Error | null) {
                            if (err) {
                                return res.json({ user: null, error: 'Failed to create user' });
                            }
                            const newUserId = this.lastID;
                            // Link the accounts
                            authDb.prepare('UPDATE oauth_users SET leverage_user_id = ? WHERE id = ?').run(newUserId, oauthUser.id);
                            res.json({
                                user: { id: newUserId, name: newUserName, email: oauthUser.email, rating: 5, balance: 0, inventory: [] },
                                oauthUser: { email: oauthUser.email, name: oauthUser.name, image: oauthUser.image },
                                isNewUser: true
                            });
                        }
                    );
                }
            });
        }
    } catch (err) {
        console.error('Error in /api/session:', err);
        res.json({ user: null });
    }
});

// Sign out - delete session and clear cookie
router.post('/auth/signout', (req, res) => {
    try {
        const sessionToken = req.cookies?.['authjs.session-token'] || req.cookies?.['__Secure-authjs.session-token'];

        if (sessionToken) {
            // Delete session from database
            authDb.prepare('DELETE FROM sessions WHERE sessionToken = ?').run(sessionToken);
        }

        // Clear cookies
        res.clearCookie('authjs.session-token', { path: '/' });
        res.clearCookie('__Secure-authjs.session-token', { path: '/' });
        res.clearCookie('authjs.callback-url', { path: '/' });
        res.clearCookie('authjs.csrf-token', { path: '/' });

        res.json({ success: true });
    } catch (err) {
        console.error('Error signing out:', err);
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

export default router;
