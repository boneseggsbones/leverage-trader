import express from 'express';
import cors from 'cors';
import db from './database';

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

// Example route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.get('/api/db-data', (req, res) => {
  const tables = ['User', 'Item', 'Trade', 'TradeStatus', 'DisputeTicket', 'DisputeStatus', 'TradeRating', 'DisputeType', 'ApiMetadata'];
  const promises = tables.map(table => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
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
  db.all('SELECT * FROM Item WHERE owner_id = ?', [userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Create a new item
app.post('/api/items', (req, res) => {
  const { name, description, owner_id } = req.body;
  if (!name || !description || !owner_id) {
    return res.status(400).json({ error: 'name, description, and owner_id are required' });
  }
  db.run('INSERT INTO Item (name, description, owner_id) VALUES (?, ?, ?)', [name, description, owner_id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID });
  });
});

// Update an item
app.put('/api/items/:id', (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' });
  }
  db.run('UPDATE Item SET name = ?, description = ? WHERE id = ?', [name, description, req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

// Delete an item
app.delete('/api/items/:id', (req, res) => {
  db.run('DELETE FROM Item WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ changes: this.changes });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
