import sqlite3 from 'sqlite3';

const DBSOURCE = 'db.sqlite';

const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) {
    // Cannot open database
    console.error(err.message);
    throw err;
  }
  console.log('Connected to the SQLite database.');

  db.serialize(() => {
    console.log('Starting database initialization...');

    // Create User table
    db.run(`CREATE TABLE IF NOT EXISTS User (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      rating REAL
    )`, (err) => { if(err) console.error('Create User table error:', err.message); else console.log('User table created.'); });

    // Create Item table
    db.run(`CREATE TABLE IF NOT EXISTS Item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      owner_id INTEGER,
      FOREIGN KEY (owner_id) REFERENCES User(id)
    )`, (err) => { if(err) console.error('Create Item table error:', err.message); else console.log('Item table created.'); });

    // Create TradeStatus table
    db.run(`CREATE TABLE IF NOT EXISTS TradeStatus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`, (err) => { if(err) console.error('Create TradeStatus table error:', err.message); else console.log('TradeStatus table created.'); });

    // Create Trade table
    db.run(`CREATE TABLE IF NOT EXISTS Trade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item1_id INTEGER,
      item2_id INTEGER,
      user1_id INTEGER,
      user2_id INTEGER,
      status_id INTEGER,
      FOREIGN KEY (item1_id) REFERENCES Item(id),
      FOREIGN KEY (item2_id) REFERENCES Item(id),
      FOREIGN KEY (user1_id) REFERENCES User(id),
      FOREIGN KEY (user2_id) REFERENCES User(id),
      FOREIGN KEY (status_id) REFERENCES TradeStatus(id)
    )`, (err) => { if(err) console.error('Create Trade table error:', err.message); else console.log('Trade table created.'); });

    // Create DisputeStatus table
    db.run(`CREATE TABLE IF NOT EXISTS DisputeStatus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`, (err) => { if(err) console.error('Create DisputeStatus table error:', err.message); else console.log('DisputeStatus table created.'); });

    // Create DisputeType table
    db.run(`CREATE TABLE IF NOT EXISTS DisputeType (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`, (err) => { if(err) console.error('Create DisputeType table error:', err.message); else console.log('DisputeType table created.'); });

    // Create DisputeTicket table
    db.run(`CREATE TABLE IF NOT EXISTS DisputeTicket (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER,
      dispute_type_id INTEGER,
      description TEXT,
      status_id INTEGER,
      FOREIGN KEY (trade_id) REFERENCES Trade(id),
      FOREIGN KEY (dispute_type_id) REFERENCES DisputeType(id),
      FOREIGN KEY (status_id) REFERENCES DisputeStatus(id)
    )`, (err) => { if(err) console.error('Create DisputeTicket table error:', err.message); else console.log('DisputeTicket table created.'); });

    // Create TradeRating table
    db.run(`CREATE TABLE IF NOT EXISTS TradeRating (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER,
      rating REAL,
      comment TEXT,
      FOREIGN KEY (trade_id) REFERENCES Trade(id)
    )`, (err) => { if(err) console.error('Create TradeRating table error:', err.message); else console.log('TradeRating table created.'); });

    // Create ApiMetadata table
    db.run(`CREATE TABLE IF NOT EXISTS ApiMetadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT
    )`, (err) => { if(err) console.error('Create ApiMetadata table error:', err.message); else console.log('ApiMetadata table created.'); });

    // Insert some seed data
    const insertUsers = `INSERT OR IGNORE INTO User (name, email, password, rating) VALUES (?,?,?,?),(?,?,?,?)`;
    db.run(insertUsers, ["Alice", "alice@example.com", "password123", 4.5, "Bob", "bob@example.com", "password456", 4.8], (err) => { if(err) console.error('Insert Users error:', err.message); else console.log('Users inserted.'); });

    const insertItems = `INSERT OR IGNORE INTO Item (name, description, owner_id) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?)`;
    db.run(insertItems, [
      "Laptop", "A powerful laptop", 1,
      "Mouse", "A wireless mouse", 1,
      "Keyboard", "A mechanical keyboard", 2,
      "Monitor", "A 27-inch monitor", 2
    ], (err) => { if(err) console.error('Insert Items error:', err.message); else console.log('Items inserted.'); });

    const insertTradeStatus = `INSERT OR IGNORE INTO TradeStatus (name) VALUES (?),(?),(?)`;
    db.run(insertTradeStatus, ["pending", "accepted", "rejected"], (err) => { if(err) console.error('Insert TradeStatus error:', err.message); else console.log('TradeStatus inserted.'); });

    const insertTrades = `INSERT OR IGNORE INTO Trade (item1_id, item2_id, user1_id, user2_id, status_id) VALUES (?,?,?,?,?)`;
    db.run(insertTrades, [1, 3, 1, 2, 1], (err) => { if(err) console.error('Insert Trades error:', err.message); else console.log('Trades inserted.'); });

    console.log('Database initialization finished.');
  });
});

export default db;