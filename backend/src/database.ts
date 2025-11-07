import sqlite3 from 'sqlite3';

const DBSOURCE = 'db.sqlite';

const db = new sqlite3.Database(DBSOURCE);

const init = () => {
  return new Promise<void>((resolve, reject) => {
    db.exec(`
      DROP TABLE IF EXISTS User;
      DROP TABLE IF EXISTS Item;
      DROP TABLE IF EXISTS TradeStatus;
      DROP TABLE IF EXISTS Trade;
      DROP TABLE IF EXISTS DisputeStatus;
      DROP TABLE IF EXISTS DisputeType;
      DROP TABLE IF EXISTS DisputeTicket;
      DROP TABLE IF EXISTS TradeRating;
      DROP TABLE IF EXISTS ApiMetadata;

      CREATE TABLE User (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        rating REAL,
        avatarUrl TEXT
      );

      CREATE TABLE Item (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        owner_id INTEGER,
        imageUrl TEXT,
        FOREIGN KEY (owner_id) REFERENCES User(id)
      );

      CREATE TABLE TradeStatus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE Trade (
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

      CREATE TABLE DisputeStatus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE DisputeType (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
      );

      CREATE TABLE DisputeTicket (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        dispute_type_id INTEGER,
        description TEXT,
        status_id INTEGER,
        FOREIGN KEY (trade_id) REFERENCES Trade(id),
        FOREIGN KEY (dispute_type_id) REFERENCES DisputeType(id),
        FOREIGN KEY (status_id) REFERENCES DisputeStatus(id)
      );

      CREATE TABLE TradeRating (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER,
        rating REAL,
        comment TEXT,
        FOREIGN KEY (trade_id) REFERENCES Trade(id)
      );

      CREATE TABLE ApiMetadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT
      );

      INSERT INTO User (name, email, password, rating, avatarUrl) VALUES ('Alice', 'alice@example.com', 'password123', 4.5, null), ('Bob', 'bob@example.com', 'password456', 4.8, null);
      INSERT INTO Item (name, description, owner_id, imageUrl) VALUES ('Laptop', 'A powerful laptop', 1, null), ('Mouse', 'A wireless mouse', 1, null), ('Keyboard', 'A mechanical keyboard', 2, null), ('Monitor', 'A 27-inch monitor', 2, null);
      INSERT INTO TradeStatus (name) VALUES ('pending'), ('accepted'), ('rejected');
      INSERT INTO Trade (item1_id, item2_id, user1_id, user2_id, status_id) VALUES (1, 3, 1, 2, 1);
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

export { db, init };