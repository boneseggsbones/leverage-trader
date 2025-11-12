import sqlite3 from 'sqlite3';

const DBSOURCE = 'db.sqlite';

const db = new sqlite3.Database(DBSOURCE);

const init = () => {
  return new Promise<void>((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS User (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        rating REAL,
        avatarUrl TEXT
      );

      CREATE TABLE IF NOT EXISTS Item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        owner_id INTEGER,
        estimatedMarketValue INTEGER DEFAULT 0,
        imageUrl TEXT,
        FOREIGN KEY (owner_id) REFERENCES User(id)
      );

      CREATE TABLE IF NOT EXISTS TradeStatus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS Trade (
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
      );

      /* New multi-item trades table (keeps arrays as JSON strings) */
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        proposerId TEXT NOT NULL,
        receiverId TEXT NOT NULL,
        proposerItemIds TEXT NOT NULL,
        receiverItemIds TEXT NOT NULL,
        proposerCash INTEGER NOT NULL,
        receiverCash INTEGER NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        disputeTicketId TEXT,
        proposerSubmittedTracking INTEGER NOT NULL,
        receiverSubmittedTracking INTEGER NOT NULL,
        proposerTrackingNumber TEXT,
        receiverTrackingNumber TEXT,
        proposerVerifiedSatisfaction INTEGER NOT NULL,
        receiverVerifiedSatisfaction INTEGER NOT NULL,
        proposerRated INTEGER NOT NULL,
        receiverRated INTEGER NOT NULL,
        ratingDeadline TEXT
      );

      CREATE TABLE IF NOT EXISTS DisputeStatus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS DisputeType (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS DisputeTicket (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        dispute_type_id INTEGER,
        description TEXT,
        status_id INTEGER,
        FOREIGN KEY (trade_id) REFERENCES Trade(id),
        FOREIGN KEY (dispute_type_id) REFERENCES DisputeType(id),
        FOREIGN KEY (status_id) REFERENCES DisputeStatus(id)
      );

      CREATE TABLE IF NOT EXISTS TradeRating (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        rating REAL,
        comment TEXT,
        FOREIGN KEY (trade_id) REFERENCES Trade(id)
      );

      CREATE TABLE IF NOT EXISTS ApiMetadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT
      );

      CREATE TABLE IF NOT EXISTS Wishlist (
        userId INTEGER,
        itemId INTEGER,
        PRIMARY KEY (userId, itemId),
        FOREIGN KEY (userId) REFERENCES User(id),
        FOREIGN KEY (itemId) REFERENCES Item(id)
      );
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        // Ensure migrations are applied before seeding so tests and runtime have the latest schema
        migrate()
          .then(() => {
            // Optionally seed minimal data if tables are empty
            db.get('SELECT COUNT(*) as count FROM User', (err, row: any) => {
              if (err) return resolve();
              if (row && row.count === 0) {
                db.exec(`
                  INSERT INTO User (name, email, password, rating, avatarUrl, balance) VALUES ('Alice', 'alice@example.com', 'password123', 4.5, null, 20000), ('Bob', 'bob@example.com', 'password456', 4.8, null, 5000);
                  INSERT INTO Item (name, description, owner_id, estimatedMarketValue, imageUrl) VALUES
                    ('Laptop', 'A powerful laptop', 1, 150000, null),
                    ('Mouse', 'A wireless mouse', 1, 2000, null),
                    ('Keyboard', 'A mechanical keyboard', 2, 12000, null),
                    ('Monitor', 'A 27-inch monitor', 2, 25000, null);
                  INSERT INTO TradeStatus (name) VALUES ('pending'), ('accepted'), ('rejected');
                `, () => resolve());
              } else {
                resolve();
              }
            });
          })
          .catch(reject);
      }
    });
  });
};

// Non-destructive migration: ensure estimatedMarketValue column exists on items
const migrate = () => {
  return new Promise<void>((resolve, reject) => {
    // Ensure Item has estimatedMarketValue
    db.all("PRAGMA table_info('Item')", (err, rows: any[]) => {
      if (err) return reject(err);
      const hasEstimated = rows.some(r => r.name === 'estimatedMarketValue');
      const tasks: Promise<void>[] = [];
      if (!hasEstimated) {
        tasks.push(new Promise((res, rej) => {
          db.run('ALTER TABLE Item ADD COLUMN estimatedMarketValue INTEGER DEFAULT 0', (err) => {
            if (err) return rej(err);
            db.run('UPDATE Item SET estimatedMarketValue = 0 WHERE estimatedMarketValue IS NULL', (err) => {
              if (err) return rej(err);
              res();
            });
          });
        }));
      }

      // Ensure User has balance column for cash transfers
      db.all("PRAGMA table_info('User')", (err2, userRows: any[]) => {
        if (err2) return reject(err2);
        const hasBalance = userRows.some(r => r.name === 'balance');
        if (!hasBalance) {
          tasks.push(new Promise((res, rej) => {
            db.run('ALTER TABLE User ADD COLUMN balance INTEGER DEFAULT 0', (err) => {
              if (err) return rej(err);
              db.run('UPDATE User SET balance = 0 WHERE balance IS NULL', (err) => {
                if (err) return rej(err);
                res();
              });
            });
          }));
        }

        Promise.all(tasks).then(() => resolve()).catch(reject);
      });
    });
  });
};

export { db, init, migrate };