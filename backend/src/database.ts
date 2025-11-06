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
    // Drop tables if they exist
    db.run(`DROP TABLE IF EXISTS User`);
    db.run(`DROP TABLE IF EXISTS Item`);

    // Create User table
    db.run(`CREATE TABLE IF NOT EXISTS User (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      rating REAL,
      avatarUrl TEXT
    )`);

    // Create Item table
    db.run(`CREATE TABLE IF NOT EXISTS Item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      owner_id INTEGER,
      imageUrl TEXT,
      FOREIGN KEY (owner_id) REFERENCES User(id)
    )`);

    // Create TradeStatus table
    db.run(`CREATE TABLE IF NOT EXISTS TradeStatus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`);

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
    )`);

    // Create DisputeStatus table
    db.run(`CREATE TABLE IF NOT EXISTS DisputeStatus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`);

    // Create DisputeType table
    db.run(`CREATE TABLE IF NOT EXISTS DisputeType (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )`);

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
    )`);

    // Create TradeRating table
    db.run(`CREATE TABLE IF NOT EXISTS TradeRating (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER,
      rating REAL,
      comment TEXT,
      FOREIGN KEY (trade_id) REFERENCES Trade(id)
    )`);

    // Create ApiMetadata table
    db.run(`CREATE TABLE IF NOT EXISTS ApiMetadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT
    )`);

    // Insert some seed data
    const insertUsers = `INSERT OR IGNORE INTO User (name, email, password, rating, avatarUrl) VALUES (?,?,?,?,?),(?,?,?,?,?)`;
    db.run(insertUsers, ["Alice", "alice@example.com", "password123", 4.5, null, "Bob", "bob@example.com", "password456", 4.8, null]);

    const insertItems = `INSERT OR IGNORE INTO Item (name, description, owner_id, imageUrl) VALUES (?,?,?,?),(?,?,?,?),(?,?,?,?),(?,?,?,?)`;
    db.run(insertItems, [
      "Laptop", "A powerful laptop", 1, null,
      "Mouse", "A wireless mouse", 1, null,
      "Keyboard", "A mechanical keyboard", 2, null,
      "Monitor", "A 27-inch monitor", 2, null
    ]);

    const insertTradeStatus = `INSERT OR IGNORE INTO TradeStatus (name) VALUES (?),(?),(?)`;
    db.run(insertTradeStatus, ["pending", "accepted", "rejected"]);

    const insertTrades = `INSERT OR IGNORE INTO Trade (item1_id, item2_id, user1_id, user2_id, status_id) VALUES (?,?,?,?,?)`;
    db.run(insertTrades, [1, 3, 1, 2, 1]);
  });
});

export default db;