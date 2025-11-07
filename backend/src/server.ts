import express from 'express';
import cors from 'cors';
import { db } from './database';
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
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  db.all('SELECT * FROM Item WHERE owner_id = ?', [userId], (err: Error | null, rows: any[]) => {
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
  db.run('INSERT INTO Item (name, description, owner_id, imageUrl) VALUES (?, ?, ?, ?)', [name, description, owner_id, imageUrl], function(this: sqlite3.RunResult, err: Error | null) {
    if (err) {
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

  let query = 'UPDATE Item SET name = ?, description = ?';
  const params = [name, description];

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

export default app;
