import express from 'express';
import cors from 'cors';
import { db, init, migrate } from './database';
import multer from 'multer';
import fs from 'fs';
import sqlite3 from 'sqlite3';

const app = express();
const port = 4000;

// Create uploads directory if it doesn't exist
const dir = './uploads';
if (!fs.existsSync(dir)){
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

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

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
  db.run('INSERT INTO Item (name, description, owner_id, estimatedMarketValue, imageUrl) VALUES (?, ?, ?, ?, ?)', [name, description, owner_id, estimatedMarketValue, imageUrl], function(this: sqlite3.RunResult, err: Error | null) {
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

  db.run(query, params, function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

// Delete an item
app.delete('/api/items/:id', (req, res) => {
  db.run('DELETE FROM Item WHERE id = ?', [req.params.id], function(this: sqlite3.RunResult, err: Error | null) {
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
      res.json({ ...row, inventory: items });
    });
  });
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
    function(err) {
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

// Cancel a trade (proposer only)
app.post('/api/trades/:id/cancel', (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });
    if (String(tradeRow.proposerId) !== String(userId)) return res.status(403).json({ error: 'Only proposer can cancel' });
    if (tradeRow.status !== 'PENDING_ACCEPTANCE') return res.status(400).json({ error: 'Can only cancel pending trades' });

    const updatedAt = new Date().toISOString();
    db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['CANCELLED', updatedAt, tradeId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: tradeId, status: 'CANCELLED' });
    });
  });
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
      db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['REJECTED', updatedAt, tradeId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ id: tradeId, status: 'REJECTED' });
      });
      return;
    }

    if (response === 'accept') {
      const updatedAt = new Date().toISOString();

      // Update status to completed awaiting rating and transfer item ownership
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

        // Transfer cash between users if applicable (ensure User.balance exists)
        const proposerCash = Number(tradeRow.proposerCash || 0);
        const receiverCash = Number(tradeRow.receiverCash || 0);

        // Update balances: proposer.balance = proposer.balance - proposerCash + receiverCash
        // receiver.balance = receiver.balance - receiverCash + proposerCash
        db.run('UPDATE User SET balance = balance - ? + ? WHERE id = ?', [proposerCash, receiverCash, tradeRow.proposerId]);
        db.run('UPDATE User SET balance = balance - ? + ? WHERE id = ?', [receiverCash, proposerCash, tradeRow.receiverId]);

        return res.json({ id: tradeId, status: 'COMPLETED_AWAITING_RATING' });
      });
      return;
    }

    return res.status(400).json({ error: 'Invalid response value' });
  });
});

// Submit payment for a trade (moves trade to shipping pending)
app.post('/api/trades/:id/submit-payment', (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    // Only allow proposer/receiver involved
    if (String(tradeRow.proposerId) !== String(userId) && String(tradeRow.receiverId) !== String(userId)) return res.status(403).json({ error: 'Not part of trade' });

    const updatedAt = new Date().toISOString();
    db.run('UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?', ['SHIPPING_PENDING', updatedAt, tradeId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: tradeId, status: 'SHIPPING_PENDING' });
    });
  });
});

// Submit tracking number for a trade
app.post('/api/trades/:id/submit-tracking', (req, res) => {
  const tradeId = req.params.id;
  const { userId, trackingNumber } = req.body;
  if (!tradeId || !userId || !trackingNumber) return res.status(400).json({ error: 'tradeId, userId and trackingNumber are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    const updatedAt = new Date().toISOString();
    const isProposer = String(tradeRow.proposerId) === String(userId);
    const field = isProposer ? 'proposerSubmittedTracking' : 'receiverSubmittedTracking';
    const trackingField = isProposer ? 'proposerTrackingNumber' : 'receiverTrackingNumber';

    db.run(`UPDATE trades SET ${field} = 1, ${trackingField} = ?, status = ?, updatedAt = ? WHERE id = ?`, [trackingNumber, 'IN_TRANSIT', updatedAt, tradeId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: tradeId, status: 'IN_TRANSIT' });
    });
  });
});

// Verify satisfaction for a trade (marks verifier; when both verified, set status and rating deadline)
app.post('/api/trades/:id/verify', (req, res) => {
  const tradeId = req.params.id;
  const { userId } = req.body;
  if (!tradeId || !userId) return res.status(400).json({ error: 'tradeId and userId are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    const isProposer = String(tradeRow.proposerId) === String(userId);
    const field = isProposer ? 'proposerVerifiedSatisfaction' : 'receiverVerifiedSatisfaction';

    db.run(`UPDATE trades SET ${field} = 1, updatedAt = ? WHERE id = ?`, [new Date().toISOString(), tradeId], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Re-fetch trade to inspect both flags
      db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err2, updated: any) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const both = updated.proposerVerifiedSatisfaction && updated.receiverVerifiedSatisfaction;
        if (both) {
          const ratingDeadline = new Date();
          ratingDeadline.setDate(ratingDeadline.getDate() + 7);
          db.run('UPDATE trades SET status = ?, ratingDeadline = ?, updatedAt = ? WHERE id = ?', ['COMPLETED_AWAITING_RATING', ratingDeadline.toISOString(), new Date().toISOString(), tradeId]);
        }

        // Return updated user objects for proposer and receiver
        db.get('SELECT * FROM User WHERE id = ?', [tradeRow.proposerId], (err3, proposer: any) => {
          if (err3) return res.status(500).json({ error: err3.message });
          db.get('SELECT * FROM User WHERE id = ?', [tradeRow.receiverId], (err4, receiver: any) => {
            if (err4) return res.status(500).json({ error: err4.message });
            // populate inventories
            db.all('SELECT * FROM Item WHERE owner_id = ?', [proposer.id], (errP: any, pItems: any[]) => {
              if (errP) return res.status(500).json({ error: errP.message });
              db.all('SELECT * FROM Item WHERE owner_id = ?', [receiver.id], (errR: any, rItems: any[]) => {
                if (errR) return res.status(500).json({ error: errR.message });
                res.json({ proposer: { ...proposer, inventory: pItems }, receiver: { ...receiver, inventory: rItems } });
              });
            });
          });
        });
      });
    });
  });
});

// Open a dispute for a trade
app.post('/api/trades/:id/open-dispute', (req, res) => {
  const tradeId = req.params.id;
  const { initiatorId, disputeType, statement } = req.body;
  if (!tradeId || !initiatorId || !disputeType || !statement) return res.status(400).json({ error: 'tradeId, initiatorId, disputeType, and statement are required' });

  db.get('SELECT * FROM trades WHERE id = ?', [tradeId], (err, tradeRow: any) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tradeRow) return res.status(404).json({ error: 'Trade not found' });

    const disputeId = `dispute-${tradeId}`;
    const now = new Date().toISOString();
    // Insert into DisputeTicket for traceability (trade_id may be integer in original schema, but we include reference in description)
    db.run('INSERT INTO DisputeTicket (trade_id, dispute_type_id, description, status_id) VALUES (?, ?, ?, ?)', [null, null, statement, null], function(err2) {
      if (err2) {
        // don't fail entirely; continue to update trade
        console.error('Failed to insert DisputeTicket:', err2);
      }

      db.run('UPDATE trades SET status = ?, disputeTicketId = ?, updatedAt = ? WHERE id = ?', ['DISPUTE_OPENED', disputeId, now, tradeId], function(err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ id: tradeId, disputeTicketId: disputeId, status: 'DISPUTE_OPENED' });
      });
    });
  });
});

if (require.main === module) {
  // Run non-destructive migrations, then initialize (if needed), then start server
  migrate()
    .then(() => init())
    .then(() => {
      app.listen(port, '127.0.0.1', () => {
        console.log(`Server is running on http://localhost:${port}`);
      });
    })
    .catch((err: any) => {
      console.error('Failed to initialize/migrate database:', err);
      process.exit(1);
    });
}

export default app;
