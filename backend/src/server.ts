import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { db, init, migrate, seedValuationData, getApiCallStats } from './database';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { refreshItemValuation, searchPriceChartingProducts, linkItemToProduct, isApiConfigured, getConsolidatedValuation } from './pricingService';
import { isEbayConfigured, getEbayAuthUrl, exchangeCodeForToken, storeUserToken, hasEbayConnection, disconnectEbay, fetchUserListings, markItemImported, isItemImported, EbayListing } from './ebayService';
import { isRapidApiConfigured } from './rapidApiEbayService';
import { isJustTcgConfigured } from './justTcgService';
import { isStockxConfigured } from './stockxService';
import { generatePriceSignalsForTrade, getPriceSignalsForItem } from './priceSignalService';
import { createTrackingRecord, getTrackingForTrade, detectCarrier } from './shippingService';
import { authHandler, authDb } from './auth';
import { fundEscrow, releaseEscrow, refundEscrow, getEscrowStatus, calculateCashDifferential, EscrowStatus } from './payments';
import { getNotificationsForUser, getUnreadCount, markAsRead, markAllAsRead, notifyTradeEvent, NotificationType } from './notifications';
import { initWebSocket } from './websocket';
import emailPreferencesRoutes from './emailPreferencesRoutes';
import { handleStripeWebhook } from './webhooks';
import { findTopMatches } from './matchingService';
import { logItemView, logSearch, logProfileView, getRecentViews, getRecentSearches } from './activityService';
import { watchItem, unwatchItem, getWatchlist, isWatching, removeWatch, findMatchingWatchers, getWatchCount } from './watchlistService';
import { normalizeLocation, normalizeCity, normalizeState } from './locationUtils';
import { calculateDistance, getCoordinates, getZipCodeData } from './distanceService';
import { createSetupIntent, savePaymentMethod, getPaymentProvidersStatus, isStripeConfigured } from './payments/paymentMethodService';
import { createProCheckoutSession, getSubscriptionStatus, createCustomerPortalSession, syncSubscriptionFromStripe } from './subscriptionService';
import { createLinkToken, exchangePublicToken, deletePlaidItem, isPlaidConfigured } from './payments/plaidService';
import { createConnectedAccount, getConnectedAccount, refreshConnectedAccountStatus, createOnboardingLink, initConnectedAccountsTable } from './payments/stripeConnectService';
import {
  getOrCreateItemInquiry,
  getOrCreateTradeConversation,
  getConversationsForUser,
  getConversation,
  sendMessage,
  getMessages,
  markConversationRead,
  getUnreadMessageCount,
  archiveConversation
} from './messaging/messagingService';
import searchRoutes from './routes/searchRoutes';

const app = express();
const httpServer = createServer(app);
const port = 4000;


// Create uploads directory if it doesn't exist
const dir = './uploads';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ storage: storage });

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', /\.loca\.lt$/],
  credentials: true
}));
app.use(cookieParser());

// Stripe webhook needs raw body - must be before express.json()
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'] as string;

  try {
    const result = await handleStripeWebhook(req.body, signature);
    console.log(`[Webhook] ${result.event}: ${result.message}`);
    res.json({ received: true, ...result });
  } catch (err: any) {
    console.error('[Webhook] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Mount Auth.js routes
app.use('/api/auth/*', authHandler);

// Check OAuth configuration status
app.get('/api/auth-status', (req, res) => {
  const { isOAuthConfigured } = require('./auth');
  res.json({
    googleConfigured: isOAuthConfigured(),
    providers: ['google'],
    message: isOAuthConfigured()
      ? 'OAuth is properly configured'
      : 'Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env'
  });
});

// Mount email preferences routes
app.use('/api/email-preferences', emailPreferencesRoutes);

// Mount search routes
app.use('/api/search', searchRoutes);

// Get current user from OAuth session (creates Leverage user if needed)
app.get('/api/session', async (req, res) => {
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
    console.error('Error in /api/auth/me:', err);
    res.json({ user: null });
  }
});

// Sign out - delete session and clear cookie
app.post('/api/auth/signout', (req, res) => {
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

// Example route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.get('/api/db-data', (req, res) => {
  const tables = ['User', 'Item', 'Trade', 'TradeStatus', 'DisputeTicket', 'DisputeStatus', 'TradeRating', 'DisputeType', 'ApiMetadata'];
  const promises = tables.map(table => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${table}`, [], (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve({ table, rows });
        }
      });
    });
  });

  Promise.all(promises)
    .then((results: any) => {
      const data = results.reduce((acc: any, result: any) => {
        acc[result.table] = result.rows;
        return acc;
      }, {});
      res.json(data);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// CRUD for Items

// Get all items for a user
app.get('/api/items', (req, res) => {
  const { userId } = req.query;
  console.log('GET /api/items called with userId=', userId);
  if (userId) {
    db.all('SELECT * FROM Item WHERE owner_id = ?', [userId], (err: Error | null, rows: any[]) => {
      if (err) {
        console.error('DB error fetching items for user', userId, err);
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    });
    return;
  }

  // No userId provided: return all items
  db.all('SELECT * FROM Item', [], (err: Error | null, rows: any[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Create a new item
app.post('/api/items', upload.single('image'), (req, res) => {
  const { name, description, owner_id } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  if (!name || !description || !owner_id) {
    return res.status(400).json({ error: 'name, description, and owner_id are required' });
  }
  const estimatedMarketValue = req.body.estimatedMarketValue ? parseInt(req.body.estimatedMarketValue, 10) : 0;
  db.run('INSERT INTO Item (name, description, owner_id, estimatedMarketValue, imageUrl) VALUES (?, ?, ?, ?, ?)', [name, description, owner_id, estimatedMarketValue, imageUrl], function (this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      console.error('Error inserting item:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

// Update an item
app.put('/api/items/:id', upload.single('image'), (req, res) => {
  const { name, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' });
  }

  const estimatedMarketValue = req.body.estimatedMarketValue ? parseInt(req.body.estimatedMarketValue, 10) : undefined;

  let query = 'UPDATE Item SET name = ?, description = ?';
  const params: any[] = [name, description];

  if (typeof estimatedMarketValue === 'number') {
    query += ', estimatedMarketValue = ?';
    params.push(estimatedMarketValue);
  }

  if (imageUrl) {
    query += ', imageUrl = ?';
    params.push(imageUrl);
  }

  query += ' WHERE id = ?';
  params.push(req.params.id);

  db.run(query, params, function (this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

// Delete an item
app.delete('/api/items/:id', (req, res) => {
  db.run('DELETE FROM Item WHERE id = ?', [req.params.id], function (this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    // Get all users
    const users: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM User', [], (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get all items
    const items: any[] = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Item', [], (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Attach inventory to each user
    const usersWithInventory = users.map(user => ({
      ...user,
      inventory: items.filter(item => item.owner_id === user.id)
    }));

    res.json(usersWithInventory);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get trade match suggestions for a user
app.get('/api/users/:userId/matches', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const limit = parseInt(req.query.limit as string, 10) || 10;

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const matches = await findTopMatches(userId, limit);
    res.json({ matches });
  } catch (err: any) {
    console.error('Error finding matches:', err?.message || err);
    console.error('Stack:', err?.stack);
    res.status(500).json({ error: 'Failed to find matches', details: err?.message });
  }
});

// Create a new user (simple signup — demo only)
app.post('/api/users', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });

  // Hash the password before storing
  const hashed = bcrypt.hashSync(String(password), 10);

  db.run('INSERT INTO User (name, email, password, rating, avatarUrl, balance) VALUES (?, ?, ?, ?, ?, ?)', [name, email, hashed, 0, null, 0], function (err) {
    if (err) {
      if ((err as any).code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Email already registered' });
      return res.status(500).json({ error: err.message });
    }
    const id = this.lastID;
    db.get('SELECT * FROM User WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ ...(row as any), inventory: [] });
    });
  });
});

// Simple login endpoint (demo only). Returns user with inventory on success.
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  db.get('SELECT * FROM User WHERE email = ?', [email], (err, row: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    // Compare hashed password
    if (!bcrypt.compareSync(String(password), String(row.password))) return res.status(401).json({ error: 'Invalid credentials' });

    db.all('SELECT * FROM Item WHERE owner_id = ?', [row.id], (err2: Error | null, items: any[]) => {
      if (err2) return res.status(500).json({ error: err2.message });
      // Fetch wishlist items for this user
      db.all('SELECT itemId FROM Wishlist WHERE userId = ?', [row.id], (err3: Error | null, wishlistRows: any[]) => {
        if (err3) return res.status(500).json({ error: err3.message });
        const wishlist = wishlistRows.map((w: any) => w.itemId);
        res.json({ ...(row as any), inventory: items, wishlist });
      });
    });
  });
});

app.post('/api/wishlist/toggle', (req, res) => {
  const { userId, itemId } = req.body;
  if (!userId || !itemId) {
    return res.status(400).json({ error: 'userId and itemId are required' });
  }

  db.get('SELECT * FROM Wishlist WHERE userId = ? AND itemId = ?', [userId, itemId], (err: Error | null, row: any) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (row) {
      // Item is in wishlist, so remove it
      db.run('DELETE FROM Wishlist WHERE userId = ? AND itemId = ?', [userId, itemId], (err: Error | null) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Item removed from wishlist' });
      });
    } else {
      // Item is not in wishlist, so add it
      db.run('INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)', [userId, itemId], async (err: Error | null) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Trigger match scan for mutual opportunities
        try {
          const { scanAndNotifyMutualMatches } = await import('./wishlistMatchService');
          scanAndNotifyMutualMatches(Number(userId)).catch(e => console.error('Match scan error:', e));
        } catch (e) {
          console.error('Failed to import wishlistMatchService:', e);
        }

        res.json({ message: 'Item added to wishlist' });
      });
    }
  });
});

// Get mutual wishlist matches for a user
app.get('/api/users/:userId/wishlist-matches', async (req, res) => {
  const { userId } = req.params;

  try {
    const { findMutualMatches } = await import('./wishlistMatchService');
    const matches = await findMutualMatches(Number(userId));
    res.json(matches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  const { city, state, distance } = req.query as { city?: string; state?: string; distance?: string };
  const distanceMiles = distance ? parseInt(distance, 10) : 50;

  try {
    // Get all items with their owner info including coordinates
    const allItems: any[] = await new Promise((resolve, reject) => {
      db.all(`
        SELECT i.*, u.city as ownerCity, u.state as ownerState, u.name as ownerName, 
               u.rating as ownerRating, u.lat as ownerLat, u.lng as ownerLng
        FROM Item i
        JOIN User u ON i.owner_id = u.id
        ORDER BY i.estimatedMarketValue DESC
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // If location is specified, filter nearby items using real distance calculation
    let nearbyItems = allItems;
    let searchLocation = { city: city || null, state: state || null };

    if (city && state) {
      // Get coordinates for the search location
      const searchCoords = getCoordinates(null, city, state);

      if (searchCoords) {
        // Use real Haversine distance calculation
        nearbyItems = allItems.filter(item => {
          // If "Any" distance, include everything
          if (distanceMiles >= 250) return true;

          // If owner has coordinates, calculate actual distance
          if (item.ownerLat != null && item.ownerLng != null) {
            const actualDistance = calculateDistance(
              searchCoords.lat, searchCoords.lng,
              item.ownerLat, item.ownerLng
            );
            return actualDistance <= distanceMiles;
          }

          // Fallback for users without coordinates: match by city/state
          const itemCity = item.ownerCity?.toLowerCase() || '';
          const itemState = item.ownerState?.toUpperCase() || '';
          const searchCity = city.toLowerCase();
          const searchState = state.toUpperCase();

          // Same city is ~0 miles, always include
          if (itemCity === searchCity && itemState === searchState) return true;

          // Same state but different city - estimate ~100 miles (conservative)
          if (distanceMiles >= 100 && itemState === searchState) return true;

          return false;
        });
      } else {
        // No coordinates for search location - fall back to city/state matching
        const searchCity = city.toLowerCase();
        const searchState = state.toUpperCase();

        nearbyItems = allItems.filter(item => {
          const itemCity = item.ownerCity?.toLowerCase() || '';
          const itemState = item.ownerState?.toUpperCase() || '';

          if (distanceMiles >= 250) return true;
          if (itemCity === searchCity && itemState === searchState) return true;
          if (distanceMiles >= 100 && itemState === searchState) return true;
          return false;
        });
      }
    }

    // Recommended: Just get varied items not filtered by location
    const recommendedItems = allItems.slice(0, 10);

    // Top rated: Filter by owner rating
    const topTraderItems = [...allItems]
      .filter(item => item.ownerRating >= 4)
      .slice(0, 10);

    res.json({
      nearbyItems: nearbyItems.slice(0, 12),
      recommendedItems,
      topTraderItems,
      searchLocation,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single user by id
app.get('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  db.get('SELECT * FROM User WHERE id = ?', [id], (err: Error | null, row: any) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    db.all('SELECT * FROM Item WHERE owner_id = ?', [id], (err: Error | null, items: any[]) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      // Fetch wishlist items for this user
      db.all('SELECT itemId FROM Wishlist WHERE userId = ?', [id], (err2: Error | null, wishlistRows: any[]) => {
        if (err2) {
          res.status(500).json({ error: err2.message });
          return;
        }
        const wishlist = wishlistRows.map((w: any) => w.itemId);
        // Map subscription fields from snake_case to camelCase
        const userWithSubscription = {
          ...row,
          subscriptionTier: row.subscription_tier || 'FREE',
          subscriptionStatus: row.subscription_status || 'none',
          tradesThisCycle: row.trades_this_cycle || 0,
          cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
          subscriptionCancelAt: row.subscription_cancel_at || null,
          inventory: items,
          wishlist
        };
        res.json(userWithSubscription);
      });
    });
  });
});

// Update user profile
app.put('/api/users/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const { name, city, state, location, aboutMe, phone } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }

  if (phone !== undefined) {
    updates.push('phone = ?');
    values.push(phone);
  }

  // Handle location field - parse "City, State" or just store as city
  // Always normalize: city to Title Case, state to 2-letter abbreviation
  // Also look up and store lat/lng coordinates for distance calculation
  if (location !== undefined) {
    const parts = location.split(',').map((p: string) => p.trim());
    const normalized = normalizeLocation(parts[0], parts[1]);
    updates.push('city = ?');
    values.push(normalized.city);
    updates.push('state = ?');
    values.push(normalized.state);

    // Look up coordinates for the city/state
    const coords = getCoordinates(null, normalized.city, normalized.state);
    if (coords) {
      updates.push('lat = ?');
      values.push(coords.lat);
      updates.push('lng = ?');
      values.push(coords.lng);
    }
  } else {
    if (city !== undefined || state !== undefined) {
      const normalized = normalizeLocation(city, state);
      if (city !== undefined) {
        updates.push('city = ?');
        values.push(normalized.city);
      }
      if (state !== undefined) {
        updates.push('state = ?');
        values.push(normalized.state);
      }

      // Look up coordinates for the city/state
      const coords = getCoordinates(null, normalized.city, normalized.state);
      if (coords) {
        updates.push('lat = ?');
        values.push(coords.lat);
        updates.push('lng = ?');
        values.push(coords.lng);
      }
    }
  }

  if (aboutMe !== undefined) {
    updates.push('aboutMe = ?');
    values.push(aboutMe);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(id);

  db.run(
    `UPDATE User SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function (err) {
      if (err) {
        console.error('[Profile] Error updating:', err);
        return res.status(500).json({ error: err.message });
      }

      // Fetch and return updated user with inventory
      db.get('SELECT * FROM User WHERE id = ?', [id], (err2: Error | null, row: any) => {
        if (err2 || !row) {
          return res.status(500).json({ error: 'Failed to fetch updated user' });
        }
        db.all('SELECT * FROM Item WHERE owner_id = ?', [id], (err3: Error | null, items: any[]) => {
          if (err3) {
            return res.status(500).json({ error: err3.message });
          }
          console.log(`[Profile] Updated user ${id}`);
          res.json({ ...row, inventory: items });
        });
      });
    }
  );
});

// =====================================================
// SUBSCRIPTION ENDPOINTS
// =====================================================

// Create Pro subscription checkout session
app.post('/api/subscription/checkout', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Note: We pass a generic success URL that the frontend will handle
  // The ProUpgradePage will show success message and guide user to their profile
  const result = await createProCheckoutSession(
    parseInt(userId, 10),
    `http://localhost:3000/profile/${userId}?upgraded=true`,
    'http://localhost:3000/pro?canceled=true'
  );

  if (result.success) {
    res.json({ checkoutUrl: result.checkoutUrl, sessionId: result.sessionId });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get subscription status for user
app.get('/api/users/:id/subscription', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const status = await getSubscriptionStatus(userId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create customer portal session for subscription management
app.post('/api/subscription/portal', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const result = await createCustomerPortalSession(
    parseInt(userId, 10),
    'http://localhost:3000/pro'
  );

  if ('url' in result) {
    res.json({ portalUrl: result.url });
  } else {
    res.status(400).json({ error: result.error });
  }
});

// Sync subscription status from Stripe (for local dev without webhooks)
app.post('/api/subscription/sync', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const result = await syncSubscriptionFromStripe(parseInt(userId, 10));
  res.json(result);
});

// =====================================================
// PAYMENT METHODS ENDPOINTS
// =====================================================


// Get payment providers configuration status
app.get('/api/payment-providers/status', (req, res) => {
  res.json(getPaymentProvidersStatus());
});

// Create Stripe SetupIntent for adding a card
app.post('/api/users/:id/payment-methods/setup-intent', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  try {
    // Get user email if available
    const user = await new Promise<any>((resolve, reject) => {
      db.get('SELECT name FROM User WHERE id = ?', [userId], (err: Error | null, row: any) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const result = await createSetupIntent(userId, undefined, user?.name);
    res.json({
      clientSecret: result.clientSecret,
      customerId: result.customerId,
    });
  } catch (err: any) {
    console.error('[SetupIntent] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Confirm and save a payment method after SetupIntent
app.post('/api/users/:id/payment-methods/confirm', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const { paymentMethodId, customerId } = req.body;
  if (!paymentMethodId || !customerId) {
    return res.status(400).json({ error: 'paymentMethodId and customerId are required' });
  }

  try {
    const result = await savePaymentMethod(userId, paymentMethodId, customerId);
    res.json(result);
  } catch (err: any) {
    console.error('[SavePaymentMethod] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all payment methods for a user
app.get('/api/users/:id/payment-methods', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  db.all(
    `SELECT id, provider, display_name, is_default, is_verified, connected_at, last_used_at, last_four, brand 
     FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, connected_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    }
  );
});

// Add a new payment method
app.post('/api/users/:id/payment-methods', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const { provider, providerAccountId, displayName, isDefault, metadata } = req.body;

  if (!provider || !displayName) {
    return res.status(400).json({ error: 'provider and displayName are required' });
  }

  const validProviders = ['stripe_card', 'stripe_bank', 'venmo', 'paypal', 'coinbase'];
  if (!validProviders.includes(provider)) {
    return res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
  }

  // If setting as default, clear other defaults first
  const setDefault = isDefault ? 1 : 0;

  const insertMethod = () => {
    db.run(
      `INSERT INTO payment_methods (user_id, provider, provider_account_id, display_name, is_default, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, provider, providerAccountId || null, displayName, setDefault, metadata ? JSON.stringify(metadata) : null],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          id: this.lastID,
          provider,
          display_name: displayName,
          is_default: setDefault,
          is_verified: 0,
          connected_at: new Date().toISOString()
        });
      }
    );
  };

  if (setDefault) {
    db.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [userId], insertMethod);
  } else {
    insertMethod();
  }
});

// Update a payment method (set as default, update display name)
app.put('/api/users/:id/payment-methods/:methodId', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const methodId = parseInt(req.params.methodId, 10);

  if (isNaN(userId) || isNaN(methodId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }

  const { displayName, isDefault } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }

  if (isDefault !== undefined) {
    updates.push('is_default = ?');
    values.push(isDefault ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(methodId, userId);

  const updateMethod = () => {
    db.run(
      `UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values,
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Payment method not found' });
        }
        res.json({ success: true });
      }
    );
  };

  // If setting as default, clear other defaults first
  if (isDefault) {
    db.run('UPDATE payment_methods SET is_default = 0 WHERE user_id = ? AND id != ?', [userId, methodId], updateMethod);
  } else {
    updateMethod();
  }
});

// Delete a payment method
app.delete('/api/users/:id/payment-methods/:methodId', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const methodId = parseInt(req.params.methodId, 10);

  if (isNaN(userId) || isNaN(methodId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }

  db.run(
    'DELETE FROM payment_methods WHERE id = ? AND user_id = ?',
    [methodId, userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Payment method not found' });
      }
      res.json({ success: true });
    }
  );
});

// =====================================================
// PLAID ENDPOINTS
// =====================================================

// Create Plaid Link token for bank account connection
app.post('/api/users/:id/plaid/link-token', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!isPlaidConfigured()) {
    return res.status(503).json({ error: 'Plaid is not configured' });
  }

  try {
    const result = await createLinkToken(userId);
    res.json(result);
  } catch (err: any) {
    console.error('[Plaid] Error creating Link token:', err);
    res.status(500).json({ error: err.message });
  }
});

// Exchange Plaid public token for access token and save bank account
app.post('/api/users/:id/plaid/exchange', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!isPlaidConfigured()) {
    return res.status(503).json({ error: 'Plaid is not configured' });
  }

  const { publicToken, metadata } = req.body;
  if (!publicToken || !metadata) {
    return res.status(400).json({ error: 'publicToken and metadata are required' });
  }

  try {
    const result = await exchangePublicToken(userId, publicToken, {
      accountId: metadata.account_id || metadata.accountId,
      accountName: metadata.account?.name || metadata.accountName || 'Bank Account',
      accountMask: metadata.account?.mask || metadata.accountMask || '****',
      institutionName: metadata.institution?.name || metadata.institutionName || 'Bank',
      institutionId: metadata.institution?.institution_id || metadata.institutionId || '',
    });
    res.json(result);
  } catch (err: any) {
    console.error('[Plaid] Error exchanging token:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a Plaid-connected bank account
app.delete('/api/users/:id/plaid/:methodId', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const methodId = parseInt(req.params.methodId, 10);

  if (isNaN(userId) || isNaN(methodId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }

  try {
    // Get the Plaid access token for this method
    const method = await new Promise<any>((resolve, reject) => {
      db.get(
        'SELECT plaid_access_token FROM payment_methods WHERE id = ? AND user_id = ?',
        [methodId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Remove from Plaid if it has an access token
    if (method?.plaid_access_token) {
      await deletePlaidItem(method.plaid_access_token);
    }

    // Delete from database
    await new Promise<void>((resolve, reject) => {
      db.run(
        'DELETE FROM payment_methods WHERE id = ? AND user_id = ?',
        [methodId, userId],
        function (err) {
          if (err) reject(err);
          else if (this.changes === 0) reject(new Error('Payment method not found'));
          else resolve();
        }
      );
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('[Plaid] Error deleting bank account:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== STRIPE CONNECT ROUTES ====================

// Get user's connected account status
app.get('/api/users/:id/stripe-connect/status', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const account = await getConnectedAccount(userId);
    if (!account) {
      return res.json({ hasAccount: false });
    }

    // Refresh status from Stripe
    const refreshed = await refreshConnectedAccountStatus(userId);
    res.json({
      hasAccount: true,
      onboardingComplete: refreshed?.onboardingComplete ?? false,
      payoutsEnabled: refreshed?.payoutsEnabled ?? false,
      email: refreshed?.email ?? null,
    });
  } catch (err: any) {
    console.error('[StripeConnect] Error getting status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create connected account and get onboarding link
app.post('/api/users/:id/stripe-connect/onboard', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Get user email
  const user = await new Promise<any>((resolve, reject) => {
    db.get('SELECT email FROM User WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!user?.email) {
    return res.status(400).json({ error: 'User not found or has no email' });
  }

  try {
    const result = await createConnectedAccount(userId, user.email);
    res.json(result);
  } catch (err: any) {
    console.error('[StripeConnect] Error creating account:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get new onboarding link (if user needs to continue onboarding)
app.post('/api/users/:id/stripe-connect/onboard-link', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const account = await getConnectedAccount(userId);
    if (!account) {
      return res.status(404).json({ error: 'No connected account found' });
    }

    const onboardingUrl = await createOnboardingLink(account.stripeAccountId);
    res.json({ onboardingUrl });
  } catch (err: any) {
    console.error('[StripeConnect] Error creating onboarding link:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reset/delete connected account (for when Stripe test account gets in bad state)
app.delete('/api/users/:id/stripe-connect', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Delete from local database (don't delete from Stripe - they may have issues)
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM connected_accounts WHERE user_id = ?', [userId], function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`[StripeConnect] Deleted connected account record for user ${userId}`);
    res.json({ success: true, message: 'Connected account reset. You can now create a new one.' });
  } catch (err: any) {
    console.error('[StripeConnect] Error deleting account:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// TRADE EVENT LOGGING
// =====================================================

type TradeEventType = 'PROPOSED' | 'COUNTER_OFFER' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'PAYMENT_FUNDED' | 'SHIPPED' | 'DELIVERED' | 'COMPLETED' | 'DISPUTE_OPENED' | 'DISPUTE_RESOLVED';

interface TradeEventSnapshot {
  proposerItemIds?: string[];
  receiverItemIds?: string[];
  proposerCash?: number;
  receiverCash?: number;
}

// Helper function to log trade events for history timeline
const logTradeEvent = (
  tradeId: string,
  eventType: TradeEventType,
  actorId: string | number,
  snapshot?: TradeEventSnapshot,
  message?: string | null
): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO trade_events (trade_id, event_type, actor_id, proposer_item_ids, receiver_item_ids, proposer_cash, receiver_cash, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tradeId,
        eventType,
        actorId,
        snapshot?.proposerItemIds ? JSON.stringify(snapshot.proposerItemIds) : null,
        snapshot?.receiverItemIds ? JSON.stringify(snapshot.receiverItemIds) : null,
        snapshot?.proposerCash ?? null,
        snapshot?.receiverCash ?? null,
        message ?? null
      ],
      function (err) {
        if (err) {
          console.error(`[TradeEvents] Failed to log ${eventType} for trade ${tradeId}:`, err);
          reject(err);
        } else {
          console.log(`[TradeEvents] Logged ${eventType} for trade ${tradeId} by user ${actorId}`);
          resolve();
        }
      }
    );
  });
};

// Get trade events for timeline
app.get('/api/trades/:id/events', (req, res) => {
  const tradeId = req.params.id;

  db.all(
    `SELECT te.*, u.name as actor_name 
     FROM trade_events te 
     LEFT JOIN User u ON te.actor_id = u.id 
     WHERE te.trade_id = ? 
     ORDER BY te.created_at ASC`,
    [tradeId],
    (err, rows: any[]) => {
      if (err) {
        console.error('[TradeEvents] Error fetching events:', err);
        return res.status(500).json({ error: err.message });
      }

      // Parse JSON arrays and format response
      const events = (rows || []).map(row => ({
        id: row.id,
        tradeId: row.trade_id,
        eventType: row.event_type,
        actorId: String(row.actor_id),
        actorName: row.actor_name || 'Unknown User',
        proposerItemIds: row.proposer_item_ids ? JSON.parse(row.proposer_item_ids) : [],
        receiverItemIds: row.receiver_item_ids ? JSON.parse(row.receiver_item_ids) : [],
        proposerCash: row.proposer_cash,
        receiverCash: row.receiver_cash,
        message: row.message,
        createdAt: row.created_at
      }));

      res.json(events);
    }
  );
});

// Propose a new trade
app.post('/api/trades', async (req, res) => {
  const { proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash, receiverCash } = req.body;

  if (!proposerId || !receiverId) {
    return res.status(400).json({ error: 'proposerId and receiverId are required' });
  }

  try {
    // Calculate platform fee based on proposer's subscription status
    const { calculateTradeFee, incrementTradeCounter } = await import('./feeService');
    const feeResult = await calculateTradeFee(parseInt(proposerId, 10));

    // Build a full trade record and insert into the new `trades` table.
    const now = new Date().toISOString();
    const tradeId = `trade-${Date.now()}`;
    const newTrade = {
      id: tradeId,
      proposerId,
      receiverId,
      proposerItemIds: Array.isArray(proposerItemIds) ? proposerItemIds : [],
      receiverItemIds: Array.isArray(receiverItemIds) ? receiverItemIds : [],
      proposerCash: typeof proposerCash === 'number' ? proposerCash : 0,
      receiverCash: typeof receiverCash === 'number' ? receiverCash : 0,
      status: 'PENDING_ACCEPTANCE',
      createdAt: now,
      updatedAt: now,
      disputeTicketId: null,
      proposerSubmittedTracking: 0,
      receiverSubmittedTracking: 0,
      proposerTrackingNumber: null,
      receiverTrackingNumber: null,
      proposerVerifiedSatisfaction: 0,
      receiverVerifiedSatisfaction: 0,
      proposerRated: 0,
      receiverRated: 0,
      ratingDeadline: null,
      // Platform fee fields
      platformFeeCents: feeResult.feeCents,
      isFeeWaived: feeResult.isWaived ? 1 : 0,
      feePayerId: proposerId,
    };

    // If fee is waived, increment the user's trade counter
    if (feeResult.isWaived) {
      await incrementTradeCounter(parseInt(proposerId, 10));
      console.log(`[Trade] Fee waived for user ${proposerId}. Remaining free trades: ${feeResult.remainingFreeTrades}`);
    }

    db.run(
      'INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash, receiverCash, status, createdAt, updatedAt, disputeTicketId, proposerSubmittedTracking, receiverSubmittedTracking, proposerTrackingNumber, receiverTrackingNumber, proposerVerifiedSatisfaction, receiverVerifiedSatisfaction, proposerRated, receiverRated, ratingDeadline, platform_fee_cents, is_fee_waived, fee_payer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        newTrade.id,
        newTrade.proposerId,
        newTrade.receiverId,
        JSON.stringify(newTrade.proposerItemIds),
        JSON.stringify(newTrade.receiverItemIds),
        newTrade.proposerCash,
        newTrade.receiverCash,
        newTrade.status,
        newTrade.createdAt,
        newTrade.updatedAt,
        newTrade.disputeTicketId,
        newTrade.proposerSubmittedTracking,
        newTrade.receiverSubmittedTracking,
        newTrade.proposerTrackingNumber,
        newTrade.receiverTrackingNumber,
        newTrade.proposerVerifiedSatisfaction,
        newTrade.receiverVerifiedSatisfaction,
        newTrade.proposerRated,
        newTrade.receiverRated,
        newTrade.ratingDeadline,
        newTrade.platformFeeCents,
        newTrade.isFeeWaived,
        newTrade.feePayerId,
      ],
      function (err) {
        if (err) {
          res.status(500).json({ error: err.message });
          return;
        }

        // Return updated proposer user object using existing GET logic
        db.get('SELECT * FROM User WHERE id = ?', [proposerId], (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          if (!row) {
            res.status(404).json({ error: 'Proposer not found' });
            return;
          }

          db.all('SELECT * FROM Item WHERE owner_id = ?', [proposerId], (err, items) => {
            if (err) {
              res.status(500).json({ error: err.message });
              return;
            }

            const user = { ...row, inventory: items };

            // Notify the receiver about the new trade proposal
            db.get('SELECT name FROM User WHERE id = ?', [proposerId], (err, proposerRow: any) => {
              const proposerName = proposerRow?.name || 'Someone';
              notifyTradeEvent(NotificationType.TRADE_PROPOSED, receiverId, tradeId, proposerName)
                .catch(err => console.error('Failed to send trade proposal notification:', err));
            });

            // Log trade event for history timeline
            logTradeEvent(tradeId, 'PROPOSED', proposerId, {
              proposerItemIds: newTrade.proposerItemIds,
              receiverItemIds: newTrade.receiverItemIds,
              proposerCash: newTrade.proposerCash,
              receiverCash: newTrade.receiverCash
            }).catch(err => console.error('Failed to log trade event:', err));

            // Include fee info in response
            res.json({
              trade: {
                ...newTrade,
                platformFeeCents: feeResult.feeCents,
                isFeeWaived: feeResult.isWaived,
                feeReason: feeResult.reason,
                remainingFreeTrades: feeResult.remainingFreeTrades,
              },
              updatedProposer: user
            });
          });
        });
      }
    );
  } catch (err: any) {
    console.error('[Trade] Error creating trade:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get trades for a user
app.get('/api/trades', (req, res) => {
  const userId = req.query.userId;
  console.log('GET /api/trades called with userId=', userId);
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  db.all('SELECT * FROM trades WHERE proposerId = ? OR receiverId = ?', [userId, userId], (err, rows) => {
    if (err) {
      console.error('DB error fetching trades for user', userId, err);
      return res.status(500).json({ error: err.message });
    }
    try {
      // parse JSON arrays
      const parsed = rows.map((r: any) => ({ ...r, proposerItemIds: JSON.parse(r.proposerItemIds || '[]'), receiverItemIds: JSON.parse(r.receiverItemIds || '[]') }));
      console.log(`GET /api/trades returning ${parsed.length} rows for userId=${userId}`);
      res.json(parsed);
    } catch (e: any) {
      console.error('Failed to parse trade rows for user', userId, e);
      res.status(500).json({ error: 'Failed to parse trades' });
    }
  });
});

// Get a single trade by ID
app.get('/api/trades/:id', (req, res) => {
  const tradeId = req.params.id;
  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, row: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Trade not found' });
    try {
      const trade = {
        ...row,
        proposerItemIds: JSON.parse(row.proposerItemIds || '[]'),
        receiverItemIds: JSON.parse(row.receiverItemIds || '[]')
      };
      res.json(trade);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to parse trade' });
    }
  });
});

// Cancel a trade (proposer only)
app.post('/api/trades/:id/cancel', async (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  try {
    const tradeRow = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Trade not found'));
        else resolve(row);
      });
    });

    // Can only cancel if you're the proposer or if trade is in a cancellable state
    const isProposer = String(tradeRow.proposerId) === String(userId);
    const isReceiver = String(tradeRow.receiverId) === String(userId);
    if (!isProposer && !isReceiver) {
      return res.status(403).json({ error: 'Only trade participants can cancel' });
    }

    // Check cancellable states
    const cancellableStates = ['PENDING_ACCEPTANCE', 'PAYMENT_PENDING', 'ESCROW_FUNDED'];
    if (!cancellableStates.includes(tradeRow.status)) {
      return res.status(400).json({ error: `Cannot cancel trade in ${tradeRow.status} status` });
    }

    // Only proposer can cancel pending trades
    if (tradeRow.status === 'PENDING_ACCEPTANCE' && !isProposer) {
      return res.status(403).json({ error: 'Only proposer can cancel pending trades' });
    }

    // Refund any escrow if exists
    let refunded = false;
    try {
      await refundEscrow(tradeId);
      refunded = true;
      console.log(`[Trade] Refunded escrow for cancelled trade ${tradeId}`);
    } catch (escrowErr: any) {
      // No escrow to refund - continue
      console.log(`[Trade] No escrow to refund for trade ${tradeId}: ${escrowErr.message}`);
    }

    const updatedAt = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['CANCELLED', updatedAt, tradeId], function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Log trade event for history timeline
    await logTradeEvent(tradeId, 'CANCELLED', userId).catch(err =>
      console.error('Failed to log trade event:', err)
    );

    // Notify the other party about the cancellation
    const otherUserId = isProposer ? tradeRow.receiverId : tradeRow.proposerId;
    db.get('SELECT name FROM User WHERE id = ?', [userId], (err, userRow: any) => {
      const userName = userRow?.name || 'The other trader';
      notifyTradeEvent(NotificationType.TRADE_CANCELLED, otherUserId, tradeId, userName)
        .catch(err => console.error('Failed to send cancellation notification:', err));
    });

    res.json({ id: tradeId, status: 'CANCELLED', escrowRefunded: refunded });
  } catch (err: any) {
    console.error('Error cancelling trade:', err);
    res.status(500).json({ error: err.message });
  }
});

// Respond to a trade (accept or reject)
app.post('/api/trades/:id/respond', (req, res) => {
  const tradeId = req.params.id;
  const { response } = req.body; // 'accept' | 'reject'

  if (!tradeId || !response) {
    return res.status(400).json({ error: 'tradeId and response are required' });
  }

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    if (tradeRow.status !== 'PENDING_ACCEPTANCE') {
      return res.status(400).json({ error: 'Trade not pending' });
    }

    if (response === 'reject') {
      const updatedAt = new Date().toISOString();
      db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['REJECTED', updatedAt, tradeId], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Notify the proposer about rejection
        db.get('SELECT name FROM User WHERE id = ?', [tradeRow.receiverId], (err, receiverRow: any) => {
          const receiverName = receiverRow?.name || 'The other trader';
          notifyTradeEvent(NotificationType.TRADE_REJECTED, tradeRow.proposerId, tradeId, receiverName)
            .catch(err => console.error('Failed to send rejection notification:', err));
        });

        // Log trade event for history timeline
        logTradeEvent(tradeId, 'REJECTED', tradeRow.receiverId)
          .catch(err => console.error('Failed to log trade event:', err));

        return res.json({ id: tradeId, status: 'REJECTED' });
      });
      return;
    }

    if (response === 'accept') {
      const updatedAt = new Date().toISOString();
      const proposerCash = Number(tradeRow.proposerCash || 0);
      const receiverCash = Number(tradeRow.receiverCash || 0);

      // Check BOTH explicit cash AND calculated cash differential from item values
      // This ensures trades with value differences require escrow even if no explicit cash was set
      (async () => {
        try {
          const cashDiff = await calculateCashDifferential(tradeId);
          const hasCashOrDifferential = proposerCash > 0 || receiverCash > 0 || cashDiff.amount > 0;

          // If there's cash or value differential involved, go to PAYMENT_PENDING for escrow funding
          // Otherwise complete the trade immediately
          if (hasCashOrDifferential) {
            db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?',
              ['PAYMENT_PENDING', updatedAt, tradeId], function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Notify the proposer about acceptance (they may need to fund)
                db.get('SELECT name FROM User WHERE id = ?', [tradeRow.receiverId], (err, receiverRow: any) => {
                  const receiverName = receiverRow?.name || 'The other trader';
                  notifyTradeEvent(NotificationType.TRADE_ACCEPTED, tradeRow.proposerId, tradeId, receiverName)
                    .catch(err => console.error('Failed to send acceptance notification:', err));
                });

                // Log trade event for history timeline
                logTradeEvent(tradeId, 'ACCEPTED', tradeRow.receiverId)
                  .catch(err => console.error('Failed to log trade event:', err));

                return res.json({ id: tradeId, status: 'PAYMENT_PENDING' });
              });
            return;
          }

          // No cash involved - complete immediately
          db.serialize(() => {
            db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['COMPLETED_AWAITING_RATING', updatedAt, tradeId]);

            // Transfer items: proposerItemIds -> receiver, receiverItemIds -> proposer
            const proposerItemIds = JSON.parse(tradeRow.proposerItemIds || '[]');
            const receiverItemIds = JSON.parse(tradeRow.receiverItemIds || '[]');

            proposerItemIds.forEach((itemId: string) => {
              db.run('UPDATE Item SET owner_id = ? WHERE id = ?', [tradeRow.receiverId, itemId]);
            });

            receiverItemIds.forEach((itemId: string) => {
              db.run('UPDATE Item SET owner_id = ? WHERE id = ?', [tradeRow.proposerId, itemId]);
            });

            // Generate price signals for all items in the completed trade
            generatePriceSignalsForTrade(tradeId).then(result => {
              console.log(`Price signals generated for trade ${tradeId}:`, result);
            }).catch(err => {
              console.error(`Failed to generate price signals for trade ${tradeId}:`, err);
            });

            // Notify the proposer about acceptance
            db.get('SELECT name FROM User WHERE id = ?', [tradeRow.receiverId], (err, receiverRow: any) => {
              const receiverName = receiverRow?.name || 'The other trader';
              notifyTradeEvent(NotificationType.TRADE_ACCEPTED, tradeRow.proposerId, tradeId, receiverName)
                .catch(err => console.error('Failed to send acceptance notification:', err));
            });

            // Log trade event for history timeline
            logTradeEvent(tradeId, 'ACCEPTED', tradeRow.receiverId)
              .catch(err => console.error('Failed to log trade event:', err));

            return res.json({ id: tradeId, status: 'COMPLETED_AWAITING_RATING' });
          });
        } catch (err: any) {
          console.error('Failed to calculate cash differential:', err);
          return res.status(500).json({ error: 'Failed to process trade acceptance: ' + err.message });
        }
      })();
      return;
    }

    return res.status(400).json({ error: 'Invalid response value' });
  });
});

// Counter a trade with modified terms
app.post('/api/trades/:id/counter', (req, res) => {
  const originalTradeId = req.params.id;
  const { userId, proposerItemIds, receiverItemIds, proposerCash, receiverCash, message } = req.body;

  if (!originalTradeId || !userId) {
    return res.status(400).json({ error: 'originalTradeId and userId are required' });
  }

  db.get('SELECT * FROM trades WHERE id = ?', [originalTradeId], (err: Error | null, originalTrade: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!originalTrade) return res.status(404).json({ error: 'Trade not found' });

    // Only the receiver can counter
    if (String(originalTrade.receiverId) !== String(userId)) {
      return res.status(403).json({ error: 'Only the receiver can counter a trade' });
    }

    // Trade must be pending
    if (originalTrade.status !== 'PENDING_ACCEPTANCE') {
      return res.status(400).json({ error: 'Can only counter pending trades' });
    }

    // Count counter-offer chain depth (limit to 3 counter-offers)
    const MAX_COUNTER_OFFERS = 3;
    const countChainDepth = (tradeId: string, callback: (err: Error | null, depth: number) => void) => {
      let depth = 0;
      const traverse = (currentId: string) => {
        db.get('SELECT parentTradeId FROM trades WHERE id = ?', [currentId], (err: Error | null, row: any) => {
          if (err) return callback(err, 0);
          if (row && row.parentTradeId) {
            depth++;
            traverse(row.parentTradeId);
          } else {
            callback(null, depth);
          }
        });
      };
      traverse(tradeId);
    };

    countChainDepth(originalTradeId, (chainErr, depth) => {
      if (chainErr) return res.status(500).json({ error: chainErr.message });

      if (depth >= MAX_COUNTER_OFFERS) {
        return res.status(400).json({
          error: `Maximum of ${MAX_COUNTER_OFFERS} counter-offers reached. Please accept or reject this offer.`,
          counterOfferCount: depth
        });
      }

      const now = new Date().toISOString();
      const counterTradeId = `trade-${Date.now()}`;

      // Mark original trade as countered
      db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['COUNTERED', now, originalTradeId], (err2: Error | null) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Create new counter trade (swap proposer/receiver)
        const counterTrade = {
          id: counterTradeId,
          proposerId: originalTrade.receiverId,  // Receiver becomes proposer
          receiverId: originalTrade.proposerId,  // Proposer becomes receiver
          proposerItemIds: JSON.stringify(proposerItemIds || []),
          receiverItemIds: JSON.stringify(receiverItemIds || []),
          proposerCash: proposerCash || 0,
          receiverCash: receiverCash || 0,
          status: 'PENDING_ACCEPTANCE',
          createdAt: now,
          updatedAt: now,
          disputeTicketId: null,
          proposerSubmittedTracking: 0,
          receiverSubmittedTracking: 0,
          proposerTrackingNumber: null,
          receiverTrackingNumber: null,
          proposerVerifiedSatisfaction: 0,
          receiverVerifiedSatisfaction: 0,
          proposerRated: 0,
          receiverRated: 0,
          ratingDeadline: null,
          parentTradeId: originalTradeId,
          counterMessage: message || null
        };

        db.run(
          `INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash, receiverCash, status, createdAt, updatedAt, disputeTicketId, proposerSubmittedTracking, receiverSubmittedTracking, proposerTrackingNumber, receiverTrackingNumber, proposerVerifiedSatisfaction, receiverVerifiedSatisfaction, proposerRated, receiverRated, ratingDeadline, parentTradeId, counterMessage) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            counterTrade.id, counterTrade.proposerId, counterTrade.receiverId,
            counterTrade.proposerItemIds, counterTrade.receiverItemIds,
            counterTrade.proposerCash, counterTrade.receiverCash,
            counterTrade.status, counterTrade.createdAt, counterTrade.updatedAt,
            counterTrade.disputeTicketId, counterTrade.proposerSubmittedTracking,
            counterTrade.receiverSubmittedTracking, counterTrade.proposerTrackingNumber,
            counterTrade.receiverTrackingNumber, counterTrade.proposerVerifiedSatisfaction,
            counterTrade.receiverVerifiedSatisfaction, counterTrade.proposerRated,
            counterTrade.receiverRated, counterTrade.ratingDeadline,
            counterTrade.parentTradeId, counterTrade.counterMessage
          ],
          function (err3: Error | null) {
            if (err3) return res.status(500).json({ error: err3.message });

            // Log trade event for history timeline on the ORIGINAL trade
            logTradeEvent(originalTradeId, 'COUNTER_OFFER', userId, {
              proposerItemIds: proposerItemIds || [],
              receiverItemIds: receiverItemIds || [],
              proposerCash: proposerCash || 0,
              receiverCash: receiverCash || 0
            }, message || null)
              .catch(err => console.error('Failed to log trade event:', err));

            res.json({
              originalTradeId,
              originalStatus: 'COUNTERED',
              counterTrade: {
                id: counterTradeId,
                status: 'PENDING_ACCEPTANCE',
                proposerId: counterTrade.proposerId,
                receiverId: counterTrade.receiverId,
                parentTradeId: originalTradeId,
                message: counterTrade.counterMessage
              }
            });
          }
        );
      });
    }); // end countChainDepth callback
  });
});

// Submit payment for a trade (holds funds in escrow)
app.post('/api/trades/:id/submit-payment', (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    // Only allow proposer/receiver involved
    const isProposer = String(tradeRow.proposerId) === String(userId);
    const isReceiver = String(tradeRow.receiverId) === String(userId);
    if (!isProposer && !isReceiver) return res.status(403).json({ error: 'Not part of trade' });

    // Determine how much this user needs to pay
    const amountToPay = isProposer ? tradeRow.proposerCash : tradeRow.receiverCash;

    // Check if user already paid (check escrow ledger)
    db.get('SELECT id FROM escrow_ledger WHERE trade_id = ? AND user_id = ? AND type = ?',
      [tradeId, userId, 'HOLD'], (err2: Error | null, existingHold: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (existingHold) return res.status(400).json({ error: 'Payment already submitted' });

        // Get user's current balance
        db.get('SELECT id, balance FROM User WHERE id = ?', [userId], (err3: Error | null, user: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          if (!user) return res.status(404).json({ error: 'User not found' });

          // If user needs to pay, verify they have enough balance
          if (amountToPay > 0 && user.balance < amountToPay) {
            return res.status(400).json({
              error: 'Insufficient balance',
              required: amountToPay,
              available: user.balance
            });
          }

          const now = new Date().toISOString();

          // If there's cash to hold, deduct from user and create ledger entry
          const holdFunds = (callback: () => void) => {
            if (amountToPay > 0) {
              db.run('UPDATE User SET balance = balance - ? WHERE id = ?', [amountToPay, userId], (err4: Error | null) => {
                if (err4) return res.status(500).json({ error: err4.message });

                db.run('INSERT INTO escrow_ledger (trade_id, user_id, amount_cents, type) VALUES (?, ?, ?, ?)',
                  [tradeId, userId, amountToPay, 'HOLD'], (err5: Error | null) => {
                    if (err5) return res.status(500).json({ error: err5.message });
                    callback();
                  });
              });
            } else {
              // No cash to hold, just record a zero hold
              db.run('INSERT INTO escrow_ledger (trade_id, user_id, amount_cents, type) VALUES (?, ?, ?, ?)',
                [tradeId, userId, 0, 'HOLD'], (err5: Error | null) => {
                  if (err5) return res.status(500).json({ error: err5.message });
                  callback();
                });
            }
          };

          holdFunds(() => {
            // Check if both parties have now paid
            db.all('SELECT user_id FROM escrow_ledger WHERE trade_id = ? AND type = ?',
              [tradeId, 'HOLD'], (err6: Error | null, holds: any[]) => {
                if (err6) return res.status(500).json({ error: err6.message });

                const paidUserIds = holds.map(h => String(h.user_id));
                const proposerPaid = paidUserIds.includes(String(tradeRow.proposerId));
                const receiverPaid = paidUserIds.includes(String(tradeRow.receiverId));
                const bothPaid = proposerPaid && receiverPaid;

                // Set status based on payment state
                let newStatus = 'PAYMENT_PENDING';
                if (bothPaid) {
                  newStatus = 'SHIPPING_PENDING'; // Skip ESCROW_FUNDED, go straight to shipping
                }

                db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?',
                  [newStatus, now, tradeId], (err7: Error | null) => {
                    if (err7) return res.status(500).json({ error: err7.message });

                    res.json({
                      id: tradeId,
                      status: newStatus,
                      amountHeld: amountToPay,
                      bothPaid
                    });
                  });
              });
          });
        });
      });
  });
});

// ========================================
// PROVIDER-AGNOSTIC ESCROW ENDPOINTS
// ========================================

// Get escrow status for a trade (includes cash differential calculation)
app.get('/api/trades/:id/escrow', async (req, res) => {
  const tradeId = req.params.id;

  try {
    const status = await getEscrowStatus(tradeId);
    res.json(status);
  } catch (err: any) {
    console.error('Error getting escrow status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a payment intent for Stripe (returns client secret)
app.post('/api/trades/:id/create-payment-intent', async (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;

  if (!tradeId || !userId) {
    return res.status(400).json({ error: 'tradeId and userId are required' });
  }

  try {
    // Get trade to determine amount
    const trade = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Trade not found'));
        else resolve(row);
      });
    });

    // Determine who pays and how much
    const isProposer = String(trade.proposerId) === String(userId);
    const payerCash = isProposer ? trade.proposerCash : trade.receiverCash;
    const recipientId = isProposer ? trade.receiverId : trade.proposerId;

    if (payerCash <= 0) {
      return res.status(400).json({ error: 'No cash payment required from this user' });
    }

    // Create escrow hold (which creates PaymentIntent for Stripe provider)
    const result = await fundEscrow(tradeId, Number(userId));

    res.json({
      success: true,
      escrowHoldId: result.escrowHold.id,
      amount: payerCash,
      provider: result.escrowHold.provider,
      clientSecret: result.clientSecret || null, // Use clientSecret from result
      requiresConfirmation: result.requiresConfirmation,
    });
  } catch (err: any) {
    console.error('Error creating payment intent:', err);
    res.status(400).json({ error: err.message });
  }
});

// Fund escrow for a trade (payer calls this)
app.post('/api/trades/:id/fund-escrow', async (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;

  if (!tradeId || !userId) {
    return res.status(400).json({ error: 'tradeId and userId are required' });
  }

  try {
    const result = await fundEscrow(tradeId, Number(userId));

    // Notify the recipient that escrow is funded
    db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, trade: any) => {
      if (!err && trade) {
        const recipientId = String(trade.proposerId) === String(userId) ? trade.receiverId : trade.proposerId;
        db.get('SELECT name FROM User WHERE id = ?', [userId], (err, payerRow: any) => {
          const payerName = payerRow?.name || 'The other trader';
          notifyTradeEvent(NotificationType.ESCROW_FUNDED, recipientId, tradeId, payerName)
            .catch(err => console.error('Failed to send escrow funded notification:', err));
        });
      }
    });

    res.json({
      success: true,
      escrowHold: result.escrowHold,
      requiresConfirmation: result.requiresConfirmation,
    });
  } catch (err: any) {
    console.error('Error funding escrow:', err);
    res.status(400).json({ error: err.message });
  }
});

// Release escrow after both parties confirm receipt
app.post('/api/trades/:id/release-escrow', async (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;  // For authorization check

  if (!tradeId) {
    return res.status(400).json({ error: 'tradeId is required' });
  }

  try {
    await releaseEscrow(tradeId);
    res.json({ success: true, message: 'Escrow released to recipient' });
  } catch (err: any) {
    console.error('Error releasing escrow:', err);
    res.status(400).json({ error: err.message });
  }
});

// Refund escrow (for cancellations or dispute resolution)
app.post('/api/trades/:id/refund-escrow', async (req, res) => {
  const tradeId = req.params.id;
  const { userId, amount } = req.body;  // Optional partial amount

  if (!tradeId) {
    return res.status(400).json({ error: 'tradeId is required' });
  }

  try {
    await refundEscrow(tradeId, amount);
    res.json({ success: true, message: 'Escrow refunded to payer' });
  } catch (err: any) {
    console.error('Error refunding escrow:', err);
    res.status(400).json({ error: err.message });
  }
});

// Calculate cash differential for a trade
app.get('/api/trades/:id/cash-differential', async (req, res) => {
  const tradeId = req.params.id;

  try {
    const differential = await calculateCashDifferential(tradeId);
    res.json(differential);
  } catch (err: any) {
    console.error('Error calculating cash differential:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// PAYOUT MANAGEMENT ENDPOINTS
// =====================================================

// Get payout status for a trade
app.get('/api/trades/:id/payout-status', async (req, res) => {
  const tradeId = req.params.id;

  try {
    const payout = await new Promise<any>((resolve, reject) => {
      db.get(
        `SELECT * FROM payouts WHERE trade_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tradeId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!payout) {
      return res.json({ hasPayout: false, message: 'No payout record for this trade' });
    }

    res.json({
      hasPayout: true,
      payout: {
        id: payout.id,
        status: payout.status,
        amountCents: payout.amount_cents,
        provider: payout.provider,
        providerReference: payout.provider_reference,
        errorMessage: payout.error_message,
        retryCount: payout.retry_count,
        createdAt: payout.created_at,
        completedAt: payout.completed_at,
      },
    });
  } catch (err: any) {
    console.error('Error getting payout status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all payouts for a user (payout history)
app.get('/api/users/:id/payouts', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Query payouts directly - includes both direct trades and chain trades
    const payouts = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT p.* 
         FROM payouts p
         WHERE p.recipient_user_id = ?
         ORDER BY p.created_at DESC`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    // Calculate totals
    const totalPending = payouts
      .filter(p => ['pending', 'pending_onboarding', 'processing'].includes(p.status))
      .reduce((sum, p) => sum + p.amount_cents, 0);
    const totalCompleted = payouts
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount_cents, 0);
    const totalFailed = payouts
      .filter(p => p.status === 'failed')
      .reduce((sum, p) => sum + p.amount_cents, 0);

    res.json({
      payouts: payouts.map(p => ({
        id: p.id,
        tradeId: p.trade_id,
        amountCents: p.amount_cents,
        status: p.status,
        provider: p.provider,
        providerReference: p.provider_reference,
        errorMessage: p.error_message,
        retryCount: p.retry_count,
        createdAt: p.created_at,
        completedAt: p.completed_at,
      })),
      summary: {
        totalPendingCents: totalPending,
        totalCompletedCents: totalCompleted,
        totalFailedCents: totalFailed,
        pendingCount: payouts.filter(p => ['pending', 'pending_onboarding', 'processing'].includes(p.status)).length,
        completedCount: payouts.filter(p => p.status === 'completed').length,
        failedCount: payouts.filter(p => p.status === 'failed').length,
      },
    });
  } catch (err: any) {
    console.error('Error fetching user payouts:', err);
    res.status(500).json({ error: err.message });
  }
});

// Retry a failed payout
app.post('/api/payouts/:id/retry', async (req, res) => {
  const payoutId = req.params.id;

  try {
    // Get the payout record
    const payout = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM payouts WHERE id = ?', [payoutId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!payout) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    // Only retry failed or pending_onboarding payouts
    if (!['failed', 'pending_onboarding'].includes(payout.status)) {
      return res.status(400).json({
        error: `Cannot retry payout with status: ${payout.status}`,
        currentStatus: payout.status
      });
    }

    // Check if recipient now has Stripe Connect enabled
    const connectedAccount = await new Promise<any>((resolve, reject) => {
      db.get(
        `SELECT stripe_account_id, payouts_enabled FROM connected_accounts WHERE user_id = ?`,
        [payout.recipient_user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!connectedAccount || !connectedAccount.payouts_enabled) {
      // Update retry count but keep pending
      const now = new Date().toISOString();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE payouts SET retry_count = retry_count + 1, updated_at = ?, error_message = ? WHERE id = ?`,
          [now, 'Recipient still needs to complete Stripe Connect setup', payoutId],
          err => err ? reject(err) : resolve()
        );
      });

      return res.status(400).json({
        error: 'Recipient has not completed Stripe Connect onboarding',
        message: 'The seller needs to set up their Stripe account to receive payouts',
        status: 'pending_onboarding',
      });
    }

    // Attempt the transfer
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-12-15.clover',
    });

    const transfer = await stripe.transfers.create({
      amount: payout.amount_cents,
      currency: 'usd',
      destination: connectedAccount.stripe_account_id,
      description: `Payout retry for trade ${payout.trade_id}`,
      metadata: {
        trade_id: payout.trade_id,
        payout_id: payoutId,
        is_retry: 'true',
      },
    });

    // Update payout record as completed
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `UPDATE payouts SET status = 'completed', provider_reference = ?, error_message = NULL, retry_count = retry_count + 1, updated_at = ?, completed_at = ? WHERE id = ?`,
        [transfer.id, now, now, payoutId],
        err => err ? reject(err) : resolve()
      );
    });

    console.log(`[Payout] Retry successful for ${payoutId}, transfer: ${transfer.id}`);

    res.json({
      success: true,
      message: 'Payout completed successfully',
      transferId: transfer.id,
      amountCents: payout.amount_cents,
    });

  } catch (err: any) {
    console.error('Error retrying payout:', err);

    // Update payout with error
    const now = new Date().toISOString();
    await new Promise<void>((resolve) => {
      db.run(
        `UPDATE payouts SET retry_count = retry_count + 1, updated_at = ?, error_message = ? WHERE id = ?`,
        [now, err.message, payoutId],
        () => resolve()
      );
    });

    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// NOTIFICATION ENDPOINTS
// =====================================================

// Get notifications for a user
app.get('/api/notifications', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const notifications = await getNotificationsForUser(String(userId));
    const unreadCount = await getUnreadCount(String(userId));
    res.json({ notifications, unreadCount });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark a notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
  const notificationId = req.params.id;

  try {
    await markAsRead(notificationId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read for a user
app.post('/api/notifications/read-all', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    await markAllAsRead(String(userId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit tracking number for a trade
app.post('/api/trades/:id/submit-tracking', async (req, res) => {
  const tradeId = req.params.id;
  const { userId, trackingNumber } = req.body;
  if (!tradeId || !userId || !trackingNumber) return res.status(400).json({ error: 'tradeId, userId and trackingNumber are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], async (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    const updatedAt = new Date().toISOString();
    const isProposer = String(tradeRow.proposerId) === String(userId);
    const isReceiver = String(tradeRow.receiverId) === String(userId);

    if (!isProposer && !isReceiver) {
      return res.status(403).json({ error: 'Not part of trade' });
    }

    const field = isProposer ? 'proposerSubmittedTracking' : 'receiverSubmittedTracking';
    const trackingField = isProposer ? 'proposerTrackingNumber' : 'receiverTrackingNumber';

    try {
      // Create tracking record with carrier detection
      const trackingInfo = await createTrackingRecord(tradeId, parseInt(userId), trackingNumber);

      // Update trade with tracking number
      db.run(`UPDATE trades SET ${field} = 1, ${trackingField} = ?, status = ?, updatedAt = ? WHERE id = ?`,
        [trackingNumber, 'IN_TRANSIT', updatedAt, tradeId], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          res.json({
            id: tradeId,
            status: 'IN_TRANSIT',
            tracking: trackingInfo
          });
        });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
});

// Get tracking status for a trade
app.get('/api/trades/:id/tracking', async (req, res) => {
  const tradeId = req.params.id;

  try {
    const tracking = await getTrackingForTrade(tradeId);

    // Get trade info for context
    db.get('SELECT proposerTrackingNumber, receiverTrackingNumber, status FROM trades WHERE id = ?',
      [tradeId], (err: Error | null, trade: any) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!trade) return res.status(404).json({ error: 'Trade not found' });

        res.json({
          tradeId,
          tradeStatus: trade.status,
          proposer: tracking.proposerTracking,
          receiver: tracking.receiverTracking,
          bothSubmitted: !!(trade.proposerTrackingNumber && trade.receiverTrackingNumber),
          bothDelivered: tracking.proposerTracking?.status === 'DELIVERED' &&
            tracking.receiverTracking?.status === 'DELIVERED'
        });
      });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// =====================================================
// SHIPPO SHIPPING INTEGRATION ENDPOINTS
// =====================================================

import {
  validateAddress,
  getRates,
  purchaseLabel,
  createReturnLabel,
  storeLabelRecord,
  getLabelForTrade,
  DEFAULT_PARCELS,
  ShippoAddress,
  Parcel
} from './shippingService';

// Get user's saved addresses
app.get('/api/users/:userId/addresses', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  db.all('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// Get user's shipping history
app.get('/api/users/:userId/shipments', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const limit = parseInt(req.query.limit as string, 10) || 20;

  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  db.all(`
    SELECT * FROM shippo_shipments 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?`,
    [userId, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

// Create a new address
app.post('/api/users/:userId/addresses', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  const { name, street1, street2, city, state, zip, country, phone, isDefault, validate } = req.body;

  if (!name || !street1 || !city || !state || !zip) {
    return res.status(400).json({ error: 'name, street1, city, state, and zip are required' });
  }

  try {
    // Optionally validate address via Shippo
    let isValidated = 0;
    let shippoObjectId = null;

    if (validate) {
      const validationResult = await validateAddress({ name, street1, street2, city, state, zip, country, phone });
      isValidated = validationResult.isValid ? 1 : 0;
      shippoObjectId = validationResult.objectId || null;

      if (!validationResult.isValid) {
        return res.status(400).json({
          error: 'Address validation failed',
          messages: validationResult.messages
        });
      }
    }

    // If setting as default, clear existing default
    if (isDefault) {
      await new Promise<void>((resolve) => {
        db.run('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [userId], () => resolve());
      });
    }

    db.run(`
      INSERT INTO user_addresses (user_id, name, street1, street2, city, state, zip, country, phone, is_default, is_validated, shippo_object_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, street1, street2 || null, city, state, zip, country || 'US', phone || null, isDefault ? 1 : 0, isValidated, shippoObjectId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          id: this.lastID,
          isValidated: isValidated === 1,
          message: 'Address saved successfully'
        });
      }
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update an address
app.put('/api/users/:userId/addresses/:addressId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const addressId = parseInt(req.params.addressId, 10);
  if (isNaN(userId) || isNaN(addressId)) return res.status(400).json({ error: 'Invalid IDs' });

  const { name, street1, street2, city, state, zip, country, phone, isDefault, validate } = req.body;

  try {
    let isValidated = 0;
    let shippoObjectId = null;

    if (validate) {
      const validationResult = await validateAddress({ name, street1, street2, city, state, zip, country, phone });
      isValidated = validationResult.isValid ? 1 : 0;
      shippoObjectId = validationResult.objectId || null;
    }

    if (isDefault) {
      await new Promise<void>((resolve) => {
        db.run('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [userId], () => resolve());
      });
    }

    db.run(`
      UPDATE user_addresses 
      SET name = ?, street1 = ?, street2 = ?, city = ?, state = ?, zip = ?, country = ?, phone = ?, 
          is_default = ?, is_validated = ?, shippo_object_id = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?`,
      [name, street1, street2 || null, city, state, zip, country || 'US', phone || null,
        isDefault ? 1 : 0, isValidated, shippoObjectId, addressId, userId],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Address not found' });
        res.json({ message: 'Address updated', isValidated: isValidated === 1 });
      }
    );
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an address
app.delete('/api/users/:userId/addresses/:addressId', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const addressId = parseInt(req.params.addressId, 10);
  if (isNaN(userId) || isNaN(addressId)) return res.status(400).json({ error: 'Invalid IDs' });

  db.run('DELETE FROM user_addresses WHERE id = ? AND user_id = ?',
    [addressId, userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Address not found' });
      res.json({ message: 'Address deleted' });
    }
  );
});

// Validate an address directly
app.post('/api/addresses/validate', async (req, res) => {
  const { name, street1, street2, city, state, zip, country, phone } = req.body;

  if (!name || !street1 || !city || !state || !zip) {
    return res.status(400).json({ error: 'name, street1, city, state, and zip are required' });
  }

  try {
    const result = await validateAddress({ name, street1, street2, city, state, zip, country, phone });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get shipping rates for a trade
app.post('/api/shipping/rates', async (req, res) => {
  const { fromAddress, toAddress, parcel, itemCategory } = req.body;

  if (!fromAddress || !toAddress) {
    return res.status(400).json({ error: 'fromAddress and toAddress are required' });
  }

  try {
    // Use provided parcel or default based on category
    const shipmentParcel: Parcel = parcel || DEFAULT_PARCELS[itemCategory || 'OTHER'];

    const result = await getRates(fromAddress, toAddress, shipmentParcel);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      shipmentId: result.shipmentId,
      rates: result.rates,
      parcelUsed: shipmentParcel
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase a shipping label
app.post('/api/shipping/purchase', async (req, res) => {
  const { rateId, tradeId, userId, carrier, servicelevel, amountCents } = req.body;

  if (!rateId) {
    return res.status(400).json({ error: 'rateId is required' });
  }

  try {
    const result = await purchaseLabel(rateId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Store label in database if trade context provided
    if (tradeId && userId) {
      await storeLabelRecord(tradeId, parseInt(userId), result, {
        carrier: carrier || result.carrier || 'Unknown',
        servicelevel: servicelevel || result.servicelevel || 'Standard',
        amountCents: amountCents || 0
      });

      // Also create tracking record
      if (result.trackingNumber) {
        await createTrackingRecord(tradeId, parseInt(userId), result.trackingNumber);
      }
    }

    res.json({
      success: true,
      transactionId: result.transactionId,
      trackingNumber: result.trackingNumber,
      labelUrl: result.labelUrl,
      carrier: result.carrier,
      servicelevel: result.servicelevel
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get label for a trade
app.get('/api/trades/:tradeId/label/:userId', async (req, res) => {
  const { tradeId, userId } = req.params;

  try {
    const label = await getLabelForTrade(tradeId, parseInt(userId));
    if (!label) {
      return res.status(404).json({ error: 'No label found for this trade/user' });
    }
    res.json(label);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create return label (for disputes)
app.post('/api/shipping/return', async (req, res) => {
  const { fromAddress, toAddress, parcel, itemCategory } = req.body;

  if (!fromAddress || !toAddress) {
    return res.status(400).json({ error: 'fromAddress and toAddress are required' });
  }

  try {
    const shipmentParcel: Parcel = parcel || DEFAULT_PARCELS[itemCategory || 'OTHER'];
    const result = await createReturnLabel(fromAddress, toAddress, shipmentParcel);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Shippo Webhook endpoint for tracking updates
app.post('/api/webhooks/shippo', express.json(), async (req, res) => {
  console.log('[Shippo Webhook] Received event');

  try {
    const event = req.body;

    // Handle track_updated events
    if (event.event === 'track_updated' || req.body.tracking_number) {
      const trackingNumber = event.data?.tracking_number || event.tracking_number;
      const status = event.data?.tracking_status?.status || event.tracking_status?.status;
      const statusDetail = event.data?.tracking_status?.status_details || event.tracking_status?.status_details;
      const location = event.data?.tracking_status?.location?.city || event.tracking_status?.location?.city;

      console.log(`[Shippo Webhook] Track update: ${trackingNumber} -> ${status}`);

      if (trackingNumber && status) {
        // Map Shippo status to our TrackingStatus
        let mappedStatus = 'UNKNOWN';
        switch (status.toUpperCase()) {
          case 'PRE_TRANSIT': mappedStatus = 'LABEL_CREATED'; break;
          case 'TRANSIT': mappedStatus = 'IN_TRANSIT'; break;
          case 'DELIVERED': mappedStatus = 'DELIVERED'; break;
          case 'RETURNED':
          case 'FAILURE': mappedStatus = 'EXCEPTION'; break;
          default: mappedStatus = 'IN_TRANSIT';
        }

        // Update shipment_tracking table
        db.run(`
          UPDATE shipment_tracking 
          SET status = ?, status_detail = ?, location = ?, last_updated = datetime('now')
          WHERE tracking_number = ?`,
          [mappedStatus, statusDetail, location, trackingNumber],
          async function (err) {
            if (err) {
              console.error('[Shippo Webhook] DB error:', err);
            }

            // Check if both parties' shipments are delivered -> auto-complete trade
            if (mappedStatus === 'DELIVERED') {
              const trade: any = await new Promise((resolve) => {
                db.get(`
                  SELECT t.id, t.status FROM trades t
                  JOIN shipment_tracking st ON st.trade_id = t.id
                  WHERE st.tracking_number = ?`,
                  [trackingNumber],
                  (err, row) => resolve(row)
                );
              });

              if (trade && trade.status === 'IN_TRANSIT') {
                const { checkBothDelivered } = await import('./shippingService');
                const bothDelivered = await checkBothDelivered(trade.id);

                if (bothDelivered) {
                  console.log(`[Shippo Webhook] Both shipments delivered for trade ${trade.id}, transitioning to DELIVERED_AWAITING_VERIFICATION`);
                  db.run(
                    `UPDATE trades SET status = 'DELIVERED_AWAITING_VERIFICATION', updatedAt = datetime('now') WHERE id = ?`,
                    [trade.id]
                  );

                  // Notify both parties
                  await notifyTradeEvent(
                    trade.id,
                    NotificationType.ESCROW_FUNDED, // reuse for "items delivered"
                    'Items Delivered',
                    'Both shipments have been delivered! Please verify and complete the trade.'
                  );
                }
              }
            }
          }
        );
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('[Shippo Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify satisfaction for a trade (marks verifier; when both verified, capture payment and complete)
app.post('/api/trades/:id/verify', async (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  try {
    const tradeRow = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, row) => {
        if (err) reject(err);
        else if (!row) reject(new Error('Trade not found'));
        else resolve(row);
      });
    });

    const isProposer = String(tradeRow.proposerId) === String(userId);
    const field = isProposer ? 'proposerVerifiedSatisfaction' : 'receiverVerifiedSatisfaction';

    await new Promise<void>((resolve, reject) => {
      db.run(`UPDATE trades SET ${field} = 1, updatedAt = ? WHERE id = ?`, [new Date().toISOString(), tradeId], function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    // Re-fetch trade to inspect both flags
    const updated = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const both = updated.proposerVerifiedSatisfaction && updated.receiverVerifiedSatisfaction;
    if (both) {
      // Both parties verified - capture payment and complete trade
      try {
        await releaseEscrow(tradeId);
        console.log(`[Trade] Captured escrow payment for trade ${tradeId}`);
      } catch (escrowErr: any) {
        // Escrow may not exist (no cash trade) or already released - log but continue
        console.log(`[Trade] No escrow to capture for trade ${tradeId}: ${escrowErr.message}`);
      }

      const ratingDeadline = new Date();
      ratingDeadline.setDate(ratingDeadline.getDate() + 7);
      await new Promise<void>((resolve, reject) => {
        db.run('UPDATE trades SET status = ?, ratingDeadline = ?, updatedAt = ? WHERE id = ?',
          ['COMPLETED_AWAITING_RATING', ratingDeadline.toISOString(), new Date().toISOString(), tradeId],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    // Return updated user objects for proposer and receiver
    const [proposer, receiver] = await Promise.all([
      new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM User WHERE id = ?', [tradeRow.proposerId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      new Promise<any>((resolve, reject) => {
        db.get('SELECT * FROM User WHERE id = ?', [tradeRow.receiverId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      })
    ]);

    const [pItems, rItems] = await Promise.all([
      new Promise<any[]>((resolve, reject) => {
        db.all('SELECT * FROM Item WHERE owner_id = ?', [proposer.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      }),
      new Promise<any[]>((resolve, reject) => {
        db.all('SELECT * FROM Item WHERE owner_id = ?', [receiver.id], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      })
    ]);

    res.json({
      proposer: { ...proposer, inventory: pItems },
      receiver: { ...receiver, inventory: rItems },
      paymentCaptured: both
    });
  } catch (err: any) {
    console.error('Error verifying trade:', err);
    res.status(500).json({ error: err.message });
  }
});

// Open a dispute for a trade
app.post('/api/trades/:id/open-dispute', (req, res) => {
  const tradeId = req.params.id;
  const { initiatorId, disputeType, statement } = req.body;
  if (!tradeId || !initiatorId || !disputeType || !statement) return res.status(400).json({ error: 'tradeId, initiatorId, disputeType, and statement are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    // Verify initiator is part of the trade
    const isProposer = String(tradeRow.proposerId) === String(initiatorId);
    const isReceiver = String(tradeRow.receiverId) === String(initiatorId);
    if (!isProposer && !isReceiver) {
      return res.status(403).json({ error: 'You are not part of this trade' });
    }

    // Determine respondent (the other party)
    const respondentId = isProposer ? tradeRow.receiverId : tradeRow.proposerId;

    const disputeId = `dispute-${tradeId}-${Date.now()}`;
    const now = new Date().toISOString();

    // Insert into new disputes table
    db.run(`INSERT INTO disputes (id, trade_id, initiator_id, respondent_id, dispute_type, status, initiator_statement, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'OPEN_AWAITING_RESPONSE', ?, ?, ?)`,
      [disputeId, tradeId, initiatorId, respondentId, disputeType, statement, now, now],
      function (err2) {
        if (err2) {
          console.error('Failed to insert dispute:', err2);
          return res.status(500).json({ error: err2.message });
        }

        // Update trade status
        db.run('UPDATE trades SET status = ?, disputeTicketId = ?, updatedAt = ? WHERE id = ?', ['DISPUTE_OPENED', disputeId, now, tradeId], function (err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({
            id: tradeId,
            disputeId,
            disputeTicketId: disputeId,
            status: 'DISPUTE_OPENED'
          });
        });
      });
  });
});

// =====================================================
// TRUST & SAFETY: RATINGS ENDPOINTS
// =====================================================

// Submit a rating for a trade partner
app.post('/api/trades/:id/rate', (req, res) => {
  const tradeId = req.params.id;
  const { raterId, overallScore, itemAccuracyScore, communicationScore, shippingSpeedScore, publicComment, privateFeedback } = req.body;

  if (!tradeId || !raterId || !overallScore) {
    return res.status(400).json({ error: 'tradeId, raterId, and overallScore are required' });
  }

  if (overallScore < 1 || overallScore > 5) {
    return res.status(400).json({ error: 'overallScore must be between 1 and 5' });
  }

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    // Verify trade is in completed awaiting rating status
    if (tradeRow.status !== 'COMPLETED_AWAITING_RATING' && tradeRow.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Trade is not ready for rating' });
    }

    // Verify rater is part of the trade
    const isProposer = String(tradeRow.proposerId) === String(raterId);
    const isReceiver = String(tradeRow.receiverId) === String(raterId);
    if (!isProposer && !isReceiver) {
      return res.status(403).json({ error: 'You are not part of this trade' });
    }

    // Check if already rated
    const ratedFlag = isProposer ? 'proposerRated' : 'receiverRated';
    if (tradeRow[ratedFlag]) {
      return res.status(400).json({ error: 'You have already rated this trade' });
    }

    // Determine ratee (the other party)
    const rateeId = isProposer ? tradeRow.receiverId : tradeRow.proposerId;

    // Insert rating
    const now = new Date().toISOString();
    db.run(`INSERT INTO trade_ratings 
            (trade_id, rater_id, ratee_id, overall_score, item_accuracy_score, communication_score, shipping_speed_score, public_comment, private_feedback, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tradeId, raterId, rateeId, overallScore, itemAccuracyScore || 0, communicationScore || 0, shippingSpeedScore || 0, publicComment || null, privateFeedback || null, now],
      function (this: sqlite3.RunResult, err2: Error | null) {
        if (err2) {
          if ((err2 as any).code === 'SQLITE_CONSTRAINT') {
            return res.status(400).json({ error: 'Rating already exists' });
          }
          return res.status(500).json({ error: err2.message });
        }

        const ratingId = this.lastID;

        // Update trade to mark this user as rated
        const updateField = isProposer ? 'proposerRated' : 'receiverRated';
        db.run(`UPDATE trades SET ${updateField} = 1, updatedAt = ? WHERE id = ?`, [now, tradeId], (err3: Error | null) => {
          if (err3) console.error('Failed to update trade rated flag:', err3);

          // Check if both have rated
          db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err4, updatedTrade: any) => {
            if (err4) return res.status(500).json({ error: err4.message });

            const bothRated = updatedTrade.proposerRated && updatedTrade.receiverRated;

            if (bothRated) {
              // Mark trade as fully completed
              db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['COMPLETED', now, tradeId]);

              // Release escrow funds - transfer to recipients
              // Proposer's cash goes to receiver, receiver's cash goes to proposer
              db.all('SELECT * FROM escrow_ledger WHERE trade_id = ? AND type = ?', [tradeId, 'HOLD'], (escErr: Error | null, holds: any[]) => {
                if (!escErr && holds) {
                  holds.forEach(hold => {
                    if (hold.amount_cents > 0) {
                      // Determine recipient (the other party)
                      const recipientId = String(hold.user_id) === String(tradeRow.proposerId)
                        ? tradeRow.receiverId
                        : tradeRow.proposerId;

                      // Add to recipient's balance
                      db.run('UPDATE User SET balance = balance + ? WHERE id = ?', [hold.amount_cents, recipientId]);

                      // Create RELEASE ledger entry
                      db.run('INSERT INTO escrow_ledger (trade_id, user_id, amount_cents, type) VALUES (?, ?, ?, ?)',
                        [tradeId, recipientId, hold.amount_cents, 'RELEASE']);
                    }
                  });
                }
              });

              // Reveal ratings
              db.run('UPDATE trade_ratings SET is_revealed = 1 WHERE trade_id = ?', [tradeId]);

              // Update both users' aggregate ratings
              [tradeRow.proposerId, tradeRow.receiverId].forEach(userId => {
                db.get('SELECT AVG(overall_score) as avg_rating FROM trade_ratings WHERE ratee_id = ?', [userId], (err5, result: any) => {
                  if (!err5 && result && result.avg_rating !== null) {
                    db.run('UPDATE User SET rating = ? WHERE id = ?', [result.avg_rating, userId]);
                  }
                });
              });
            }

            res.json({
              ratingId,
              tradeId,
              bothRated,
              tradeStatus: bothRated ? 'COMPLETED' : 'COMPLETED_AWAITING_RATING'
            });
          });
        });
      });
  });
});

// Get all ratings received by a user
app.get('/api/users/:id/ratings', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  db.all(`SELECT tr.*, 
          u.name as rater_name,
          t.proposerItemIds, t.receiverItemIds
          FROM trade_ratings tr
          LEFT JOIN User u ON tr.rater_id = u.id
          LEFT JOIN trades t ON tr.trade_id = t.id
          WHERE tr.ratee_id = ? AND tr.is_revealed = 1
          ORDER BY tr.created_at DESC`,
    [userId], (err: Error | null, ratings: any[]) => {
      if (err) return res.status(500).json({ error: err.message });

      // Also get aggregate stats
      db.get(`SELECT 
              COUNT(*) as total_ratings,
              AVG(overall_score) as avg_overall,
              AVG(item_accuracy_score) as avg_item_accuracy,
              AVG(communication_score) as avg_communication,
              AVG(shipping_speed_score) as avg_shipping_speed
              FROM trade_ratings WHERE ratee_id = ?`, [userId], (err2: Error | null, stats: any) => {
        if (err2) return res.status(500).json({ error: err2.message });

        res.json({
          ratings: ratings || [],
          stats: stats ? {
            totalRatings: stats.total_ratings || 0,
            avgOverall: stats.avg_overall ? Math.round(stats.avg_overall * 10) / 10 : null,
            avgItemAccuracy: stats.avg_item_accuracy ? Math.round(stats.avg_item_accuracy * 10) / 10 : null,
            avgCommunication: stats.avg_communication ? Math.round(stats.avg_communication * 10) / 10 : null,
            avgShippingSpeed: stats.avg_shipping_speed ? Math.round(stats.avg_shipping_speed * 10) / 10 : null
          } : null
        });
      });
    });
});

// =====================================================
// TRUST & SAFETY: DISPUTE ENDPOINTS
// =====================================================

// Get dispute details
app.get('/api/disputes/:id', (req, res) => {
  const disputeId = req.params.id;

  db.get('SELECT * FROM disputes WHERE id = ?', [disputeId], (err: Error | null, dispute: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    // Get initiator and respondent names
    db.get('SELECT name FROM User WHERE id = ?', [dispute.initiator_id], (err2: Error | null, initiator: any) => {
      db.get('SELECT name FROM User WHERE id = ?', [dispute.respondent_id], (err3: Error | null, respondent: any) => {
        res.json({
          ...dispute,
          initiator_name: initiator?.name || 'Unknown',
          respondent_name: respondent?.name || 'Unknown'
        });
      });
    });
  });
});

// Respondent submits their response to a dispute
app.post('/api/disputes/:id/respond', (req, res) => {
  const disputeId = req.params.id;
  const { respondentId, statement } = req.body;

  if (!disputeId || !respondentId || !statement) {
    return res.status(400).json({ error: 'disputeId, respondentId, and statement are required' });
  }

  db.get('SELECT * FROM disputes WHERE id = ?', [disputeId], (err: Error | null, dispute: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    if (String(dispute.respondent_id) !== String(respondentId)) {
      return res.status(403).json({ error: 'Only the respondent can respond to this dispute' });
    }

    if (dispute.status !== 'OPEN_AWAITING_RESPONSE') {
      return res.status(400).json({ error: 'Dispute is not awaiting response' });
    }

    const now = new Date().toISOString();
    db.run(`UPDATE disputes SET respondent_statement = ?, status = 'IN_MEDIATION', updated_at = ? WHERE id = ?`,
      [statement, now, disputeId], (err2: Error | null) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ id: disputeId, status: 'IN_MEDIATION' });
      });
  });
});

// Resolve a dispute (basic v1 - self-resolution or moderator)
app.post('/api/disputes/:id/resolve', (req, res) => {
  const disputeId = req.params.id;
  const { resolution, resolverNotes } = req.body;

  if (!disputeId || !resolution) {
    return res.status(400).json({ error: 'disputeId and resolution are required' });
  }

  const validResolutions = ['TRADE_UPHELD', 'FULL_REFUND', 'PARTIAL_REFUND', 'TRADE_REVERSAL', 'MUTUALLY_RESOLVED'];
  if (!validResolutions.includes(resolution)) {
    return res.status(400).json({ error: `Invalid resolution. Must be one of: ${validResolutions.join(', ')}` });
  }

  db.get('SELECT * FROM disputes WHERE id = ?', [disputeId], (err: Error | null, dispute: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    if (dispute.status === 'RESOLVED') {
      return res.status(400).json({ error: 'Dispute is already resolved' });
    }

    const now = new Date().toISOString();
    db.run(`UPDATE disputes SET resolution = ?, resolution_notes = ?, status = 'RESOLVED', resolved_at = ?, updated_at = ? WHERE id = ?`,
      [resolution, resolverNotes || null, now, now, disputeId], (err2: Error | null) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Handle escrow based on resolution
        const tradeId = dispute.trade_id;

        if (resolution === 'FULL_REFUND' || resolution === 'TRADE_REVERSAL') {
          // Refund held funds to original payers
          db.all('SELECT * FROM escrow_ledger WHERE trade_id = ? AND type = ?', [tradeId, 'HOLD'], (escErr: Error | null, holds: any[]) => {
            if (!escErr && holds) {
              holds.forEach(hold => {
                if (hold.amount_cents > 0) {
                  // Return to original payer
                  db.run('UPDATE User SET balance = balance + ? WHERE id = ?', [hold.amount_cents, hold.user_id]);

                  // Create REFUND ledger entry
                  db.run('INSERT INTO escrow_ledger (trade_id, user_id, amount_cents, type) VALUES (?, ?, ?, ?)',
                    [tradeId, hold.user_id, hold.amount_cents, 'REFUND']);
                }
              });
            }
          });
        } else if (resolution === 'TRADE_UPHELD' || resolution === 'MUTUALLY_RESOLVED') {
          // Release to recipients as normal trade completion
          db.all('SELECT * FROM escrow_ledger WHERE trade_id = ? AND type = ?', [tradeId, 'HOLD'], (escErr: Error | null, holds: any[]) => {
            if (!escErr && holds) {
              db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (trErr: Error | null, trade: any) => {
                if (!trErr && trade) {
                  holds.forEach(hold => {
                    if (hold.amount_cents > 0) {
                      const recipientId = String(hold.user_id) === String(trade.proposerId)
                        ? trade.receiverId
                        : trade.proposerId;

                      db.run('UPDATE User SET balance = balance + ? WHERE id = ?', [hold.amount_cents, recipientId]);
                      db.run('INSERT INTO escrow_ledger (trade_id, user_id, amount_cents, type) VALUES (?, ?, ?, ?)',
                        [tradeId, recipientId, hold.amount_cents, 'RELEASE']);
                    }
                  });
                }
              });
            }
          });
        }

        // Update the associated trade status
        db.run(`UPDATE trades SET status = 'DISPUTE_RESOLVED', updatedAt = ? WHERE disputeTicketId = ?`,
          [now, disputeId], (err3: Error | null) => {
            if (err3) console.error('Failed to update trade status:', err3);
            res.json({ id: disputeId, status: 'RESOLVED', resolution });
          });
      });
  });
});

// =====================================================
// VALUATION API ENDPOINTS
// =====================================================

// Get all item categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM item_categories ORDER BY name', [], (err: Error | null, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Search product catalog
app.get('/api/products/search', (req, res) => {
  const { q, category_id } = req.query;
  let query = 'SELECT * FROM product_catalog WHERE 1=1';
  const params: any[] = [];

  if (q) {
    query += ' AND name LIKE ?';
    params.push(`%${q}%`);
  }
  if (category_id) {
    query += ' AND category_id = ?';
    params.push(category_id);
  }
  query += ' LIMIT 50';

  db.all(query, params, (err: Error | null, rows: any[]) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get all valuation sources for an item
app.get('/api/items/:id/valuations', (req, res) => {
  const itemId = req.params.id;

  // Get the item first
  db.get('SELECT * FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Get API valuations
    db.all('SELECT * FROM api_valuations WHERE item_id = ? OR product_id = ? ORDER BY fetched_at DESC',
      [itemId, item.product_id], (err2: Error | null, apiValuations: any[]) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Get user overrides
        db.all('SELECT * FROM user_value_overrides WHERE item_id = ? ORDER BY created_at DESC',
          [itemId], (err3: Error | null, userOverrides: any[]) => {
            if (err3) return res.status(500).json({ error: err3.message });

            // Get condition assessment
            db.get('SELECT * FROM condition_assessments WHERE item_id = ? ORDER BY assessed_at DESC LIMIT 1',
              [itemId], (err4: Error | null, condition: any) => {
                if (err4) return res.status(500).json({ error: err4.message });

                res.json({
                  item: {
                    id: item.id,
                    name: item.name,
                    current_emv_cents: item.estimatedMarketValue,
                    emv_source: item.emv_source,
                    emv_confidence: item.emv_confidence,
                    condition: item.condition,
                    category_id: item.category_id,
                    psa_cert_number: item.psa_cert_number,
                    psa_grade: item.psa_grade,
                  },
                  apiValuations: apiValuations || [],
                  userOverrides: userOverrides || [],
                  conditionAssessment: condition || null,
                });
              });
          });
      });
  });
});

// Submit user value override
app.post('/api/items/:id/valuations/override', (req, res) => {
  const itemId = req.params.id;
  const { userId, overrideValueCents, reason, justification } = req.body;

  if (!userId || !overrideValueCents) {
    return res.status(400).json({ error: 'userId and overrideValueCents are required' });
  }

  // First get current item value to store as original
  db.get('SELECT estimatedMarketValue FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const originalValue = item.estimatedMarketValue;

    // Insert the override record
    db.run(`INSERT INTO user_value_overrides (item_id, user_id, override_value_cents, original_api_value_cents, reason, justification, status)
            VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
      [itemId, userId, overrideValueCents, originalValue, reason || null, justification || null],
      function (this: sqlite3.RunResult, err2: Error | null) {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }

        // Also update the Item's actual EMV and store original value
        db.run(`UPDATE Item SET 
                estimatedMarketValue = ?, 
                emv_source = 'user_override',
                emv_confidence = 100,
                original_api_value_cents = COALESCE(original_api_value_cents, ?)
                WHERE id = ?`,
          [overrideValueCents, originalValue, itemId],
          (err3: Error | null) => {
            if (err3) {
              return res.status(500).json({ error: err3.message });
            }
            res.json({
              id: this.lastID,
              status: 'approved',
              originalValue,
              newValue: overrideValueCents
            });
          });
      });
  });
});

// Get historical trade prices for similar items
app.get('/api/items/:id/similar-prices', (req, res) => {
  const itemId = req.params.id;

  // Get the item to find its product/category
  db.get('SELECT * FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Find similar trade price signals
    let query = `
      SELECT tps.*, 
             CASE WHEN tps.product_id = ? THEN 1.0 ELSE 0.7 END as relevance
      FROM trade_price_signals tps
      WHERE (tps.product_id = ? OR tps.category_id = ?)
        AND tps.implied_value_cents BETWEEN ? AND ?
      ORDER BY relevance DESC, trade_completed_at DESC
      LIMIT 20
    `;

    const emv = item.estimatedMarketValue || 10000; // Default to $100 if no EMV
    db.all(query, [
      item.product_id,
      item.product_id,
      item.category_id,
      Math.floor(emv * 0.5),
      Math.floor(emv * 1.5)
    ], (err2: Error | null, signals: any[]) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Calculate aggregate stats
      const prices = (signals || []).map(s => s.implied_value_cents);
      const stats = prices.length > 0 ? {
        count: prices.length,
        avgPriceCents: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        minPriceCents: Math.min(...prices),
        maxPriceCents: Math.max(...prices),
      } : null;

      res.json({
        item: { id: item.id, name: item.name, product_id: item.product_id, category_id: item.category_id },
        signals: signals || [],
        stats,
      });
    });
  });
});

// Get price signals for an item (direct signals from trades involving this item)
app.get('/api/items/:id/price-signals', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  try {
    const result = await getPriceSignalsForItem(itemId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PRICING API ENDPOINTS
// =====================================================

// Refresh item valuation from external API
app.post('/api/items/:id/refresh-valuation', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);

  try {
    const result = await refreshItemValuation(itemId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh valuation'
    });
  }
});

// Search external pricing API for products to link
app.get('/api/external/products/search', async (req, res) => {
  const q = req.query.q as string;

  if (!q || q.length < 2) {
    return res.json({ products: [], apiConfigured: isApiConfigured() });
  }

  try {
    const products = await searchPriceChartingProducts(q);
    res.json({
      products: products.map(p => ({
        id: p.id,
        name: p['product-name'],
        platform: p['console-name'],
        provider: 'pricecharting',
        loosePrice: p['loose-price'] || 0,
        cibPrice: p['cib-price'] || 0,
        newPrice: p['new-price'] || 0
      })),
      apiConfigured: isApiConfigured()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Link an item to an external product
app.post('/api/items/:id/link-product', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  const { pricechartingId, productName, consoleName } = req.body;

  if (!pricechartingId) {
    return res.status(400).json({ success: false, message: 'pricechartingId is required' });
  }

  try {
    const result = await linkItemToProduct(itemId, pricechartingId, productName, consoleName);

    if (result.success) {
      // Immediately refresh the valuation after linking
      const valuationResult = await refreshItemValuation(itemId);
      res.json({ ...result, valuation: valuationResult });
    } else {
      res.json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check if pricing API is configured
app.get('/api/pricing/status', (req, res) => {
  res.json({
    configured: isApiConfigured() || isEbayConfigured() || isRapidApiConfigured() || isJustTcgConfigured() || isStockxConfigured(),
    providers: [
      { name: 'pricecharting', configured: isApiConfigured(), description: 'Video Games, TCG, Comics' },
      { name: 'ebay', configured: isEbayConfigured(), description: 'eBay Marketplace Insights API' },
      { name: 'rapidapi_ebay', configured: isRapidApiConfigured(), description: 'eBay Sold Listings (via RapidAPI)' },
      { name: 'justtcg', configured: isJustTcgConfigured(), description: 'Trading Cards (Pokémon, MTG, Yu-Gi-Oh)' },
      { name: 'stockx', configured: isStockxConfigured(), description: 'Sneakers & Streetwear' }
    ]
  });
});

// Get consolidated valuation from multiple sources
app.get('/api/items/:id/consolidated-valuation', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);

  if (isNaN(itemId)) {
    return res.status(400).json({ success: false, message: 'Invalid item ID' });
  }

  try {
    const result = await getConsolidatedValuation(itemId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      consolidated: null,
      message: error.message || 'Failed to get consolidated valuation'
    });
  }
});

// =====================================================
// ZIP CODE LOOKUP
// =====================================================

// Look up zip code to get city/state
app.get('/api/zipcode/:zip', async (req, res) => {
  const { zip } = req.params;

  // Validate 5-digit zip
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Invalid zip code format' });
  }

  try {
    // Use free zippopotam.us API
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`);

    if (!response.ok) {
      return res.status(404).json({ error: 'Zip code not found' });
    }

    const data = await response.json();
    const place = data.places?.[0];

    if (!place) {
      return res.status(404).json({ error: 'Zip code not found' });
    }

    res.json({
      zip,
      city: place['place name'],
      state: place['state abbreviation'],
      stateFull: place.state
    });
  } catch (err: any) {
    console.error('Zip code lookup error:', err);
    res.status(500).json({ error: 'Failed to look up zip code' });
  }
});

// =====================================================
// ANALYTICS ENDPOINTS
// =====================================================

// Get user analytics dashboard data
app.get('/api/analytics/user/:userId', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Get all trades for user
  db.all(`SELECT * FROM trades WHERE proposerId = ? OR receiverId = ?`, [userId, userId], (err: Error | null, trades: any[]) => {
    if (err) return res.status(500).json({ error: err.message });

    const allTrades = trades || [];
    const completedTrades = allTrades.filter(t => t.status === 'COMPLETED' || t.status === 'DISPUTE_RESOLVED');

    // Calculate total value traded (sum of item values + cash in completed trades)
    let totalValueTraded = 0;
    let netSurplus = 0;

    completedTrades.forEach(t => {
      const isProposer = String(t.proposerId) === String(userId);
      // Add cash traded
      if (isProposer) {
        totalValueTraded += t.proposerCash + t.receiverCash;
        netSurplus += t.receiverCash - t.proposerCash;
      } else {
        totalValueTraded += t.proposerCash + t.receiverCash;
        netSurplus += t.proposerCash - t.receiverCash;
      }
    });

    // Get average rating
    db.get('SELECT AVG(overall_score) as avg_rating, COUNT(*) as rating_count FROM trade_ratings WHERE ratee_id = ?',
      [userId], (err2: Error | null, ratingData: any) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Group trades by month
        const tradesByMonth: Record<string, number> = {};
        const tradesByStatus: Record<string, number> = {};

        allTrades.forEach(t => {
          // By month
          const date = new Date(t.createdAt);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          tradesByMonth[monthKey] = (tradesByMonth[monthKey] || 0) + 1;

          // By status
          tradesByStatus[t.status] = (tradesByStatus[t.status] || 0) + 1;
        });

        // Convert to arrays
        const monthsArray = Object.entries(tradesByMonth)
          .map(([month, count]) => ({ month, count }))
          .sort((a, b) => a.month.localeCompare(b.month))
          .slice(-12); // Last 12 months

        const statusArray = Object.entries(tradesByStatus)
          .map(([status, count]) => ({ status, count }));

        // Get top trading partners
        const partnerCounts: Record<string, number> = {};
        allTrades.forEach(t => {
          const partnerId = String(t.proposerId) === String(userId) ? t.receiverId : t.proposerId;
          partnerCounts[partnerId] = (partnerCounts[partnerId] || 0) + 1;
        });

        const topPartnerIds = Object.entries(partnerCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, count]) => ({ id, count }));

        if (topPartnerIds.length === 0) {
          return res.json({
            totalTrades: allTrades.length,
            completedTrades: completedTrades.length,
            totalValueTraded,
            netTradeSurplus: netSurplus,
            avgRating: ratingData?.avg_rating ? Math.round(ratingData.avg_rating * 10) / 10 : null,
            ratingCount: ratingData?.rating_count || 0,
            tradesByMonth: monthsArray,
            tradesByStatus: statusArray,
            topTradingPartners: []
          });
        }

        // Fetch partner names
        const partnerIdList = topPartnerIds.map(p => p.id).join(',');
        db.all(`SELECT id, name FROM User WHERE id IN (${partnerIdList})`, [], (err3: Error | null, partners: any[]) => {
          if (err3) return res.status(500).json({ error: err3.message });

          const partnerMap = new Map((partners || []).map(p => [String(p.id), p.name]));
          const topTradingPartners = topPartnerIds.map(p => ({
            userId: p.id,
            name: partnerMap.get(String(p.id)) || 'Unknown',
            count: p.count
          }));

          res.json({
            totalTrades: allTrades.length,
            completedTrades: completedTrades.length,
            totalValueTraded,
            netTradeSurplus: netSurplus,
            avgRating: ratingData?.avg_rating ? Math.round(ratingData.avg_rating * 10) / 10 : null,
            ratingCount: ratingData?.rating_count || 0,
            tradesByMonth: monthsArray,
            tradesByStatus: statusArray,
            topTradingPartners
          });
        });
      });
  });
});

// Get item valuation history for trend charts
app.get('/api/analytics/item/:itemId/history', (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  // Get the item
  db.get('SELECT id, name, estimatedMarketValue, emv_source FROM Item WHERE id = ?', [itemId], (err: Error | null, item: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Get API valuation history
    db.all(`SELECT fetched_at as date, value_cents as valueCents, api_provider as source 
            FROM api_valuations 
            WHERE item_id = ? 
            ORDER BY fetched_at ASC`, [itemId], (err2: Error | null, apiHistory: any[]) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Get user override history
      db.all(`SELECT created_at as date, override_value_cents as valueCents, 'user_override' as source 
              FROM user_value_overrides 
              WHERE item_id = ? AND status = 'approved'
              ORDER BY created_at ASC`, [itemId], (err3: Error | null, overrideHistory: any[]) => {
        if (err3) return res.status(500).json({ error: err3.message });

        // Get trade price signals for this item
        db.all(`SELECT trade_completed_at as date, implied_value_cents as valueCents, 'trade' as source 
                FROM trade_price_signals 
                WHERE item_id = ?
                ORDER BY trade_completed_at ASC`, [itemId], (err4: Error | null, tradeHistory: any[]) => {
          if (err4) return res.status(500).json({ error: err4.message });

          // Combine all valuation history
          const allHistory = [
            ...(apiHistory || []).map(h => ({ ...h, source: 'api' })),
            ...(overrideHistory || []),
            ...(tradeHistory || [])
          ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // If no history, create a single point with current value
          const valuations = allHistory.length > 0 ? allHistory : [{
            date: new Date().toISOString(),
            valueCents: item.estimatedMarketValue || 0,
            source: item.emv_source || 'user_defined'
          }];

          res.json({
            itemId: item.id,
            name: item.name,
            currentValueCents: item.estimatedMarketValue || 0,
            valuations
          });
        });
      });
    });
  });
});

// =====================================================
// ADMIN DASHBOARD ENDPOINTS
// =====================================================

// Admin authorization middleware helper
const checkAdminAuth = (userId: string | number): Promise<boolean> => {
  return new Promise((resolve) => {
    db.get('SELECT isAdmin FROM User WHERE id = ?', [userId], (err: Error | null, row: any) => {
      if (err || !row) return resolve(false);
      resolve(row.isAdmin === 1);
    });
  });
};

// Get platform-wide statistics
app.get('/api/admin/stats', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const stats = await new Promise<any>((resolve, reject) => {
      db.get('SELECT COUNT(*) as totalUsers FROM User', [], (err: Error | null, userCount: any) => {
        if (err) return reject(err);

        db.get('SELECT COUNT(*) as totalItems FROM Item', [], (err2: Error | null, itemCount: any) => {
          if (err2) return reject(err2);

          db.all('SELECT status, COUNT(*) as count FROM trades GROUP BY status', [], (err3: Error | null, tradesByStatus: any[]) => {
            if (err3) return reject(err3);

            db.get('SELECT COUNT(*) as totalDisputes, SUM(CASE WHEN status != \'RESOLVED\' THEN 1 ELSE 0 END) as openDisputes FROM disputes', [], (err4: Error | null, disputeStats: any) => {
              if (err4) return reject(err4);

              db.get('SELECT SUM(amount) as totalEscrow FROM escrow_holds WHERE status = \'FUNDED\'', [], (err5: Error | null, escrowStats: any) => {
                if (err5) return reject(err5);

                db.get('SELECT SUM(proposerCash + receiverCash) as totalTradeValue FROM trades WHERE status IN (\'COMPLETED\', \'DISPUTE_RESOLVED\')', [], (err6: Error | null, valueStats: any) => {
                  if (err6) return reject(err6);

                  const totalTrades = (tradesByStatus || []).reduce((sum, s) => sum + s.count, 0);
                  const statusBreakdown: Record<string, number> = {};
                  (tradesByStatus || []).forEach(s => { statusBreakdown[s.status] = s.count; });

                  resolve({
                    totalUsers: userCount?.totalUsers || 0,
                    totalItems: itemCount?.totalItems || 0,
                    totalTrades,
                    tradesByStatus: statusBreakdown,
                    totalDisputes: disputeStats?.totalDisputes || 0,
                    openDisputes: disputeStats?.openDisputes || 0,
                    escrowHeldCents: escrowStats?.totalEscrow || 0,
                    totalTradeValueCents: valueStats?.totalTradeValue || 0
                  });
                });
              });
            });
          });
        });
      });
    });

    res.json(stats);
  } catch (err: any) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all trades with optional filters
app.get('/api/admin/trades', async (req, res) => {
  const { userId, status, limit = '50', offset = '0' } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  let query = `
    SELECT t.*, 
           p.name as proposerName, 
           r.name as receiverName
    FROM trades t
    LEFT JOIN User p ON t.proposerId = p.id
    LEFT JOIN User r ON t.receiverId = r.id
  `;
  const params: any[] = [];

  if (status) {
    query += ' WHERE t.status = ?';
    params.push(status);
  }

  query += ' ORDER BY t.createdAt DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  db.all(query, params, (err: Error | null, trades: any[]) => {
    if (err) return res.status(500).json({ error: err.message });

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM trades';
    const countParams: any[] = [];
    if (status) {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }

    db.get(countQuery, countParams, (err2: Error | null, countResult: any) => {
      if (err2) return res.status(500).json({ error: err2.message });

      res.json({
        trades: trades || [],
        total: countResult?.total || 0,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      });
    });
  });
});

// Get all disputes with optional filters
app.get('/api/admin/disputes', async (req, res) => {
  const { userId, status } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  let query = `
    SELECT d.*, 
           i.name as initiatorName, 
           r.name as respondentName,
           t.proposerItemIds, t.receiverItemIds
    FROM disputes d
    LEFT JOIN User i ON d.initiator_id = i.id
    LEFT JOIN User r ON d.respondent_id = r.id
    LEFT JOIN trades t ON d.trade_id = t.id
  `;
  const params: any[] = [];

  if (status) {
    query += ' WHERE d.status = ?';
    params.push(status);
  }

  query += ' ORDER BY d.created_at DESC';

  db.all(query, params, (err: Error | null, disputes: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ disputes: disputes || [] });
  });
});

// Get all users with stats
app.get('/api/admin/users', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const query = `
    SELECT u.id, u.name, u.email, u.rating, u.balance, u.createdAt, u.isAdmin,
           (SELECT COUNT(*) FROM trades WHERE proposerId = u.id OR receiverId = u.id) as tradeCount,
           (SELECT COUNT(*) FROM Item WHERE owner_id = u.id) as itemCount
    FROM User u
    ORDER BY u.id ASC
  `;

  db.all(query, [], (err: Error | null, users: any[]) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ users: users || [] });
  });
});

// Toggle user admin status
app.post('/api/admin/users/:id/toggle-admin', async (req, res) => {
  const { userId } = req.query;
  const targetUserId = req.params.id;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Get current admin status
  db.get('SELECT id, name, isAdmin FROM User WHERE id = ?', [targetUserId], (err: Error | null, user: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newAdminStatus = user.isAdmin === 1 ? 0 : 1;

    db.run('UPDATE User SET isAdmin = ? WHERE id = ?', [newAdminStatus, targetUserId], function (err2: Error | null) {
      if (err2) return res.status(500).json({ error: err2.message });

      res.json({
        success: true,
        user: { ...user, isAdmin: newAdminStatus },
        message: `${user.name} is ${newAdminStatus === 1 ? 'now an admin' : 'no longer an admin'}`
      });
    });
  });
});

// Quick resolve dispute from admin panel
app.post('/api/admin/disputes/:id/resolve', async (req, res) => {
  const { userId } = req.query;
  const disputeId = req.params.id;
  const { resolution, refundToInitiator } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Get dispute details
  db.get('SELECT * FROM disputes WHERE id = ?', [disputeId], (err: Error | null, dispute: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.status === 'RESOLVED') return res.status(400).json({ error: 'Dispute already resolved' });

    const now = new Date().toISOString();

    // Update dispute status
    db.run(
      'UPDATE disputes SET status = ?, resolution = ?, resolved_at = ? WHERE id = ?',
      ['RESOLVED', resolution || 'Resolved by admin', now, disputeId],
      function (err2: Error | null) {
        if (err2) return res.status(500).json({ error: err2.message });

        // Update trade status
        db.run(
          'UPDATE trades SET status = ? WHERE id = ?',
          ['DISPUTE_RESOLVED', dispute.trade_id],
          (err3: Error | null) => {
            if (err3) console.error('Failed to update trade status:', err3);

            res.json({
              success: true,
              message: 'Dispute resolved successfully',
              dispute: { ...dispute, status: 'RESOLVED', resolution: resolution || 'Resolved by admin' }
            });
          }
        );
      }
    );
  });
});

// Get trade analytics for charts
app.get('/api/admin/analytics', async (req, res) => {
  const { userId, days = '30' } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const daysNum = parseInt(days as string, 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysNum);
  const startDateStr = startDate.toISOString().split('T')[0];

  // Get trades grouped by day
  const query = `
    SELECT 
      date(createdAt) as date,
      COUNT(*) as tradeCount,
      SUM(proposerCash + receiverCash) as totalValue,
      SUM(CASE WHEN status = 'COMPLETED' OR status = 'DISPUTE_RESOLVED' THEN 1 ELSE 0 END) as completedCount
    FROM trades 
    WHERE date(createdAt) >= ?
    GROUP BY date(createdAt)
    ORDER BY date(createdAt) ASC
  `;

  db.all(query, [startDateStr], (err: Error | null, tradesByDay: any[]) => {
    if (err) return res.status(500).json({ error: err.message });

    // Get disputes grouped by day
    db.all(`
      SELECT date(created_at) as date, COUNT(*) as disputeCount
      FROM disputes
      WHERE date(created_at) >= ?
      GROUP BY date(created_at)
    `, [startDateStr], (err2: Error | null, disputesByDay: any[]) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Get user signups grouped by day
      db.all(`
        SELECT date(createdAt) as date, COUNT(*) as userCount
        FROM User
        WHERE date(createdAt) >= ?
        GROUP BY date(createdAt)
      `, [startDateStr], (err3: Error | null, usersByDay: any[]) => {
        if (err3) return res.status(500).json({ error: err3.message });

        res.json({
          tradesByDay: tradesByDay || [],
          disputesByDay: disputesByDay || [],
          usersByDay: usersByDay || [],
          periodDays: daysNum
        });
      });
    });
  });
});

// =========================================================
// TRADE GRAPH FOUNDATION ROUTES (Phase 0+1)
// =========================================================

// Activity Events (Phase 0)

// Log item view
app.post('/api/events/item-view', async (req, res) => {
  const { userId, itemId } = req.body;
  if (!userId || !itemId) {
    return res.status(400).json({ error: 'userId and itemId are required' });
  }
  try {
    await logItemView(Number(userId), Number(itemId));
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error logging item view:', err);
    res.status(500).json({ error: err.message });
  }
});

// Log search event
app.post('/api/events/search', async (req, res) => {
  const { userId, query, categoryId } = req.body;
  if (!userId || !query) {
    return res.status(400).json({ error: 'userId and query are required' });
  }
  try {
    await logSearch(Number(userId), query, categoryId ? Number(categoryId) : undefined);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error logging search:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get recent activity for a user
app.get('/api/users/:id/activity', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    const [recentViews, recentSearches] = await Promise.all([
      getRecentViews(userId, 10),
      getRecentSearches(userId, 10)
    ]);
    res.json({ recentViews, recentSearches });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Watchlist Routes (Phase 1)

// Get user's watchlist
app.get('/api/users/:id/watchlist', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  try {
    const watchlist = await getWatchlist(userId);
    res.json({ watchlist });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove from watchlist by watch ID
app.delete('/api/users/:id/watchlist/:watchId', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const watchId = parseInt(req.params.watchId, 10);
  if (isNaN(userId) || isNaN(watchId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }
  try {
    const removed = await removeWatch(userId, watchId);
    res.json({ success: removed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Watch a specific item
app.post('/api/items/:id/watch', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  const { userId } = req.body;
  if (isNaN(itemId) || !userId) {
    return res.status(400).json({ error: 'Invalid item ID or missing userId' });
  }
  try {
    const watch = await watchItem(Number(userId), itemId);
    res.json({ watch });
  } catch (err: any) {
    if (err.message === 'Cannot watch your own item') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// Unwatch a specific item
app.delete('/api/items/:id/watch', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  const { userId } = req.body;
  if (isNaN(itemId) || !userId) {
    return res.status(400).json({ error: 'Invalid item ID or missing userId' });
  }
  try {
    const removed = await unwatchItem(Number(userId), itemId);
    res.json({ success: removed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Check if user is watching an item
app.get('/api/items/:id/watching', async (req, res) => {
  const itemId = parseInt(req.params.id, 10);
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : null;
  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }
  try {
    const [watchCountResult, isUserWatching] = await Promise.all([
      getWatchCount(itemId),
      userId ? isWatching(userId, itemId) : Promise.resolve(false)
    ]);
    res.json({ watchCount: watchCountResult, isWatching: isUserWatching });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// EBAY IMPORT ENDPOINTS
// =============================================================================

// Get eBay authorization URL for user consent
app.get('/api/ebay/auth/url', (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  // Create a state token that includes user ID for security
  const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
  const authUrl = getEbayAuthUrl(state);

  res.json({ authUrl, state });
});

// eBay OAuth callback - exchanges code for tokens
app.get('/api/ebay/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state parameter' });
  }

  try {
    // Decode state to get userId
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const userId = parseInt(stateData.userId, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    // Exchange code for tokens
    const token = await exchangeCodeForToken(code as string);
    if (!token) {
      return res.status(400).json({ error: 'Failed to exchange code for token' });
    }

    // Store tokens in database
    await storeUserToken(userId, token);

    console.log(`[eBay] User ${userId} connected their eBay account`);

    // Redirect to frontend import page
    res.redirect(`http://localhost:3000/import/ebay?success=true`);
  } catch (err: any) {
    console.error('[eBay] OAuth callback error:', err);
    res.redirect(`http://localhost:3000/import/ebay?error=${encodeURIComponent(err.message)}`);
  }
});

// Check if user has connected eBay account
app.get('/api/ebay/status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const connected = await hasEbayConnection(parseInt(userId as string, 10));
    res.json({ connected, configured: isEbayConfigured() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect eBay account
app.delete('/api/ebay/disconnect', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    await disconnectEbay(parseInt(userId, 10));
    console.log(`[eBay] User ${userId} disconnected their eBay account`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch user's eBay listings for import preview
app.get('/api/ebay/listings', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const listings = await fetchUserListings(parseInt(userId as string, 10));

    // Check which items have already been imported
    const listingsWithStatus = await Promise.all(
      listings.map(async (listing) => ({
        ...listing,
        alreadyImported: await isItemImported(parseInt(userId as string, 10), listing.itemId)
      }))
    );

    res.json({ listings: listingsWithStatus });
  } catch (err: any) {
    console.error('[eBay] Error fetching listings:', err);
    res.status(500).json({ error: err.message });
  }
});

// Import selected eBay listings as Leverage items
app.post('/api/ebay/import', async (req, res) => {
  const { userId, listings } = req.body;

  if (!userId || !listings || !Array.isArray(listings)) {
    return res.status(400).json({ error: 'userId and listings array are required' });
  }

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  };

  for (const listing of listings as EbayListing[]) {
    try {
      // Check if already imported
      if (await isItemImported(userId, listing.itemId)) {
        results.skipped++;
        continue;
      }

      // Create new item in Leverage
      const imageUrl = listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls[0] : null;

      const newItemId = await new Promise<number>((resolve, reject) => {
        db.run(
          `INSERT INTO Item (name, description, owner_id, estimatedMarketValue, imageUrl, condition, emv_source, status)
           VALUES (?, ?, ?, ?, ?, ?, 'ebay_import', 'active')`,
          [
            listing.title,
            listing.description || '',
            userId,
            listing.price, // Already in cents
            imageUrl,
            listing.condition
          ],
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      // Mark as imported to prevent duplicates
      await markItemImported(userId, listing.itemId, newItemId);
      results.imported++;

    } catch (err: any) {
      console.error(`[eBay] Error importing listing ${listing.itemId}:`, err);
      results.errors.push(`Failed to import "${listing.title}": ${err.message}`);
    }
  }

  console.log(`[eBay] User ${userId} imported ${results.imported} items, skipped ${results.skipped}`);
  res.json(results);
});

// =============================================================================
// CHAIN TRADE ENDPOINTS
// =============================================================================

import {
  scanAndPropose,
  getChainProposalsForUser,
  getChainProposal,
  acceptChainProposal,
  rejectChainProposal,
  fundChainEscrow,
  submitChainShipping,
  verifyChainReceipt,
  ChainStatus
} from './chainTradeService';
import { findValidChains, getGraphStats } from './chainMatchService';

// Scan for chain trade opportunities and create proposals
app.post('/api/chains/scan', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    console.log(`[ChainTrade] Scanning for chains for user ${userId}...`);
    const proposals = await scanAndPropose(Number(userId));
    res.json({ proposals, count: proposals.length });
  } catch (err: any) {
    console.error('[ChainTrade] Scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all chain proposals for a user
app.get('/api/chains/proposals', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const proposals = await getChainProposalsForUser(Number(userId));
    res.json({ proposals });
  } catch (err: any) {
    console.error('[ChainTrade] Get proposals error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a specific chain proposal
app.get('/api/chains/:id', async (req, res) => {
  const chainId = req.params.id;

  try {
    const proposal = await getChainProposal(chainId);
    if (!proposal) {
      return res.status(404).json({ error: 'Chain proposal not found' });
    }
    res.json({ proposal });
  } catch (err: any) {
    console.error('[ChainTrade] Get proposal error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Accept a chain proposal
app.post('/api/chains/:id/accept', async (req, res) => {
  const chainId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const proposal = await acceptChainProposal(chainId, Number(userId));
    res.json({ proposal, success: true });
  } catch (err: any) {
    console.error('[ChainTrade] Accept error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Reject a chain proposal (cancels the entire chain)
app.post('/api/chains/:id/reject', async (req, res) => {
  const chainId = req.params.id;
  const { userId, reason } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const proposal = await rejectChainProposal(chainId, Number(userId), reason);
    res.json({ proposal, success: true });
  } catch (err: any) {
    console.error('[ChainTrade] Reject error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Fund escrow for a chain trade
app.post('/api/chains/:id/fund', async (req, res) => {
  const chainId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const proposal = await fundChainEscrow(chainId, Number(userId));
    res.json({ proposal, success: true });
  } catch (err: any) {
    console.error('[ChainTrade] Fund error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Submit shipping for a chain leg
app.post('/api/chains/:id/ship', async (req, res) => {
  const chainId = req.params.id;
  const { userId, trackingNumber, carrier } = req.body;

  if (!userId || !trackingNumber) {
    return res.status(400).json({ error: 'userId and trackingNumber are required' });
  }

  try {
    const proposal = await submitChainShipping(chainId, Number(userId), trackingNumber, carrier || 'Unknown');
    res.json({ proposal, success: true });
  } catch (err: any) {
    console.error('[ChainTrade] Ship error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Verify receipt for a chain leg
app.post('/api/chains/:id/verify', async (req, res) => {
  const chainId = req.params.id;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const proposal = await verifyChainReceipt(chainId, Number(userId));
    res.json({ proposal, success: true });
  } catch (err: any) {
    console.error('[ChainTrade] Verify error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Admin: Get all valid chains in the system
app.get('/api/admin/chains', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const chains = await findValidChains();
    const stats = await getGraphStats();
    res.json({ chains, stats });
  } catch (err: any) {
    console.error('[ChainTrade] Admin chains error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get trade graph statistics
app.get('/api/admin/chain-graph-stats', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const isAdmin = await checkAdminAuth(userId as string);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const stats = await getGraphStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[ChainTrade] Graph stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// PSA GRADING API ENDPOINTS
// =============================================================================

import { isPsaConfigured, verifyCertification, linkItemToPSA, getItemPSAData, getRemainingCalls } from './psaService';

// Get PSA API status
app.get('/api/psa/status', (req, res) => {
  res.json({
    configured: isPsaConfigured(),
    remainingCalls: getRemainingCalls(),
    dailyLimit: 100
  });
});

// Verify a PSA certification by cert number
app.get('/api/psa/verify/:certNumber', async (req, res) => {
  const { certNumber } = req.params;

  if (!certNumber || certNumber.length < 5) {
    return res.status(400).json({ error: 'Valid cert number required' });
  }

  try {
    const certData = await verifyCertification(certNumber);

    if (!certData) {
      return res.status(404).json({
        error: 'Certification not found',
        configured: isPsaConfigured(),
        remainingCalls: getRemainingCalls()
      });
    }

    res.json({
      ...certData,
      remainingCalls: getRemainingCalls()
    });
  } catch (err: any) {
    console.error('[PSA] Verification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Link an item to a PSA certification
app.post('/api/items/:itemId/link-psa', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { certNumber } = req.body;

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  if (!certNumber || certNumber.length < 5) {
    return res.status(400).json({ error: 'Valid cert number required' });
  }

  try {
    const result = await linkItemToPSA(itemId, certNumber);
    res.json(result);
  } catch (err: any) {
    console.error('[PSA] Link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// MESSAGING ENDPOINTS
// =====================================================

// Get all conversations for the current user
app.get('/api/users/:userId/conversations', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  try {
    const includeArchived = req.query.includeArchived === 'true';
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const conversations = await getConversationsForUser(userId, { includeArchived, limit });

    // Enrich with context previews (item or trade info)
    const enriched = await Promise.all(conversations.map(async (conv) => {
      if (conv.type === 'item_inquiry') {
        // Get item info
        return new Promise((resolve) => {
          db.get(`SELECT id, name, imageUrl, estimatedMarketValue FROM Item WHERE id = ?`,
            [conv.contextId], (err: Error | null, item: any) => {
              resolve({ ...conv, contextPreview: item || null });
            });
        });
      } else if (conv.type === 'trade') {
        // Get trade info with other user
        return new Promise((resolve) => {
          db.get(`SELECT id, proposerId, receiverId, status FROM trades WHERE id = ?`,
            [conv.contextId], (err: Error | null, trade: any) => {
              if (!trade) return resolve({ ...conv, contextPreview: null });
              const otherUserId = trade.proposerId === userId ? trade.receiverId : trade.proposerId;
              db.get(`SELECT id, name, profilePictureUrl FROM User WHERE id = ?`, [otherUserId],
                (err2: Error | null, otherUser: any) => {
                  resolve({ ...conv, contextPreview: { trade, otherUser } });
                });
            });
        });
      }
      return conv;
    }));

    res.json({ conversations: enriched });
  } catch (err: any) {
    console.error('[Messaging] Get conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get unread message count
app.get('/api/users/:userId/messages/unread-count', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  try {
    const count = await getUnreadMessageCount(userId);
    res.json({ unreadCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get or create item inquiry conversation
app.post('/api/items/:itemId/inquiry', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);
  const { inquirerUserId } = req.body;

  if (isNaN(itemId)) return res.status(400).json({ error: 'Invalid item ID' });
  if (!inquirerUserId) return res.status(400).json({ error: 'inquirerUserId required' });

  try {
    // Get item owner
    const item: any = await new Promise((resolve, reject) => {
      db.get('SELECT owner_id FROM Item WHERE id = ?', [itemId], (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.owner_id === inquirerUserId) {
      return res.status(400).json({ error: 'Cannot inquire about your own item' });
    }

    const conversation = await getOrCreateItemInquiry(itemId, inquirerUserId, item.owner_id);
    res.json(conversation);
  } catch (err: any) {
    console.error('[Messaging] Create inquiry error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single conversation with messages
app.get('/api/conversations/:conversationId', async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = parseInt(req.query.userId as string, 10);

  if (!userId) return res.status(400).json({ error: 'userId query param required' });

  try {
    const conversation = await getConversation(conversationId, userId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = await getMessages(conversationId, userId, { limit: 100 });

    // Mark as read
    await markConversationRead(conversationId, userId);

    res.json({ ...conversation, messages });
  } catch (err: any) {
    console.error('[Messaging] Get conversation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a conversation (paginated)
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
  const conversationId = req.params.conversationId;
  const userId = parseInt(req.query.userId as string, 10);
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const before = req.query.before as string | undefined;

  if (!userId) return res.status(400).json({ error: 'userId query param required' });

  try {
    const messages = await getMessages(conversationId, userId, { limit, before });
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message
app.post('/api/conversations/:conversationId/messages', async (req, res) => {
  const conversationId = req.params.conversationId;
  const { senderId, content, messageType } = req.body;

  if (!senderId) return res.status(400).json({ error: 'senderId required' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });

  try {
    const message = await sendMessage(conversationId, senderId, content.trim(), messageType || 'text');
    res.json(message);
  } catch (err: any) {
    console.error('[Messaging] Send message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark conversation as read
app.post('/api/conversations/:conversationId/read', async (req, res) => {
  const conversationId = req.params.conversationId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    await markConversationRead(conversationId, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Archive a conversation
app.post('/api/conversations/:conversationId/archive', async (req, res) => {
  const conversationId = req.params.conversationId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    await archiveConversation(conversationId, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get PSA data for an item
app.get('/api/items/:itemId/psa', async (req, res) => {
  const itemId = parseInt(req.params.itemId, 10);

  if (isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid item ID' });
  }

  try {
    const psaData = await getItemPSAData(itemId);

    if (!psaData) {
      return res.status(404).json({ error: 'No PSA data linked to this item' });
    }

    res.json(psaData);
  } catch (err: any) {
    console.error('[PSA] Get data error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// API CALL STATISTICS ENDPOINT
// =============================================================================

/**
 * @route GET /api/analytics/api-stats
 * @desc Get API call statistics for all external APIs
 * @access Public (for now - consider adding auth later)
 */
app.get('/api/analytics/api-stats', async (_req, res) => {
  try {
    const stats = await getApiCallStats();

    // Add known APIs that may not have been called yet
    const knownApis = [
      'PriceCharting',
      'eBay (Official)',
      'RapidAPI eBay',
      'JustTCG',
      'StockX',
      'PSA'
    ];

    const statsMap = new Map(stats.map(s => [s.api_name, s]));
    const result = knownApis.map(api => ({
      api_name: api,
      call_count: statsMap.get(api)?.call_count || 0,
      last_called_at: statsMap.get(api)?.last_called_at || null,
      error_count: statsMap.get(api)?.error_count || 0,
      last_error: statsMap.get(api)?.last_error || null
    }));

    res.json(result);
  } catch (err) {
    console.error('Error getting API stats:', err);
    res.status(500).json({ error: 'Failed to get API statistics' });
  }
});

if (require.main === module) {
  // Run non-destructive migrations, then initialize (if needed), seed data, then start server
  migrate()
    .then(() => init())
    .then(() => seedValuationData())
    .then(() => initConnectedAccountsTable())
    .then(() => {
      // Initialize WebSocket server
      initWebSocket(httpServer);

      httpServer.listen(port, '127.0.0.1', () => {
        console.log(`Server is running on http://localhost:${port}`);
        console.log(`WebSocket available at ws://localhost:${port}/ws`);
      });
    })
    .catch((err: any) => {
      console.error('Failed to initialize/migrate database:', err);
      process.exit(1);
    });
}

export default app;

