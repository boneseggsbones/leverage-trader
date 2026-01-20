import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { db, init, migrate, seedValuationData } from './database';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { refreshItemValuation, searchPriceChartingProducts, linkItemToProduct, isApiConfigured } from './pricingService';
import { generatePriceSignalsForTrade, getPriceSignalsForItem } from './priceSignalService';
import { createTrackingRecord, getTrackingForTrade, detectCarrier } from './shippingService';
import { authHandler, authDb } from './auth';
import { fundEscrow, releaseEscrow, refundEscrow, getEscrowStatus, calculateCashDifferential, EscrowStatus } from './payments';
import { getNotificationsForUser, getUnreadCount, markAsRead, markAllAsRead, notifyTradeEvent, NotificationType } from './notifications';
import { initWebSocket } from './websocket';
import emailPreferencesRoutes from './emailPreferencesRoutes';
import { handleStripeWebhook } from './webhooks';

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
  origin: ['http://localhost:3000', 'http://localhost:5173'],
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
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM User', [], (err: Error | null, rows: any[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
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
      db.run('INSERT INTO Wishlist (userId, itemId) VALUES (?, ?)', [userId, itemId], (err: Error | null) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Item added to wishlist' });
      });
    }
  });
});

app.get('/api/dashboard', (req, res) => {
  // For now, return a simplified set of data.
  // A full implementation would require more complex queries.
  db.all('SELECT * FROM Item LIMIT 10', [], (err: Error | null, rows: any[]) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({
      nearbyItems: rows,
      recommendedItems: rows,
      topTraderItems: rows,
    });
  });
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
        res.json({ ...row, inventory: items, wishlist });
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

  const { name, city, state, location, aboutMe } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }

  // Handle location field - parse "City, State" or just store as city
  if (location !== undefined) {
    const parts = location.split(',').map((p: string) => p.trim());
    updates.push('city = ?');
    values.push(parts[0] || '');
    updates.push('state = ?');
    values.push(parts[1] || '');
  } else {
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city);
    }
    if (state !== undefined) {
      updates.push('state = ?');
      values.push(state);
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

// Propose a new trade
app.post('/api/trades', (req, res) => {
  const { proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash } = req.body;

  if (!proposerId || !receiverId) {
    return res.status(400).json({ error: 'proposerId and receiverId are required' });
  }

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
    receiverCash: 0,
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
  };

  db.run(
    'INSERT INTO trades (id, proposerId, receiverId, proposerItemIds, receiverItemIds, proposerCash, receiverCash, status, createdAt, updatedAt, disputeTicketId, proposerSubmittedTracking, receiverSubmittedTracking, proposerTrackingNumber, receiverTrackingNumber, proposerVerifiedSatisfaction, receiverVerifiedSatisfaction, proposerRated, receiverRated, ratingDeadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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

          res.json({ trade: newTrade, updatedProposer: user });
        });
      });
    }
  );
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

        return res.json({ id: tradeId, status: 'REJECTED' });
      });
      return;
    }

    if (response === 'accept') {
      const updatedAt = new Date().toISOString();
      const proposerCash = Number(tradeRow.proposerCash || 0);
      const receiverCash = Number(tradeRow.receiverCash || 0);
      const hasCash = proposerCash > 0 || receiverCash > 0;

      // If there's cash involved, go to PAYMENT_PENDING for escrow funding
      // Otherwise complete the trade immediately
      if (hasCash) {
        db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?',
          ['PAYMENT_PENDING', updatedAt, tradeId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Notify the proposer about acceptance (they may need to fund)
            db.get('SELECT name FROM User WHERE id = ?', [tradeRow.receiverId], (err, receiverRow: any) => {
              const receiverName = receiverRow?.name || 'The other trader';
              notifyTradeEvent(NotificationType.TRADE_ACCEPTED, tradeRow.proposerId, tradeId, receiverName)
                .catch(err => console.error('Failed to send acceptance notification:', err));
            });

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

        return res.json({ id: tradeId, status: 'COMPLETED_AWAITING_RATING' });
      });
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

  db.run(`INSERT INTO user_value_overrides (item_id, user_id, override_value_cents, reason, justification, status)
          VALUES (?, ?, ?, ?, ?, 'pending')`,
    [itemId, userId, overrideValueCents, reason || null, justification || null],
    function (this: sqlite3.RunResult, err: Error | null) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, status: 'pending' });
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
        provider: 'pricecharting'
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
    configured: isApiConfigured(),
    providers: [
      { name: 'pricecharting', configured: isApiConfigured(), description: 'Video Games, TCG, Comics' }
    ]
  });
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

if (require.main === module) {
  // Run non-destructive migrations, then initialize (if needed), seed data, then start server
  migrate()
    .then(() => init())
    .then(() => seedValuationData())
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

