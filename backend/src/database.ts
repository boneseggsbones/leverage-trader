import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

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

      -- Full trade ratings table for Trust & Safety
      CREATE TABLE IF NOT EXISTS trade_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        rater_id INTEGER NOT NULL,
        ratee_id INTEGER NOT NULL,
        overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
        item_accuracy_score INTEGER CHECK (item_accuracy_score BETWEEN 0 AND 5),
        communication_score INTEGER CHECK (communication_score BETWEEN 0 AND 5),
        shipping_speed_score INTEGER CHECK (shipping_speed_score BETWEEN 0 AND 5),
        public_comment TEXT,
        private_feedback TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        is_revealed INTEGER DEFAULT 0,
        UNIQUE(trade_id, rater_id),
        FOREIGN KEY (rater_id) REFERENCES User(id),
        FOREIGN KEY (ratee_id) REFERENCES User(id)
      );

      -- Disputes table with enhanced fields
      CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        initiator_id INTEGER NOT NULL,
        respondent_id INTEGER NOT NULL,
        dispute_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN_AWAITING_RESPONSE',
        initiator_statement TEXT,
        respondent_statement TEXT,
        resolution TEXT,
        resolution_notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT,
        FOREIGN KEY (initiator_id) REFERENCES User(id),
        FOREIGN KEY (respondent_id) REFERENCES User(id)
      );

      CREATE INDEX IF NOT EXISTS idx_trade_ratings_ratee ON trade_ratings(ratee_id);
      CREATE INDEX IF NOT EXISTS idx_trade_ratings_trade ON trade_ratings(trade_id);
      CREATE INDEX IF NOT EXISTS idx_disputes_trade ON disputes(trade_id);

      -- Escrow ledger for payment tracking
      CREATE TABLE IF NOT EXISTS escrow_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('HOLD', 'RELEASE', 'REFUND')),
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES User(id)
      );
      CREATE INDEX IF NOT EXISTS idx_escrow_trade ON escrow_ledger(trade_id);
      CREATE INDEX IF NOT EXISTS idx_escrow_user ON escrow_ledger(user_id);

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

      -- =====================================================
      -- HYBRID VALUATION SYSTEM TABLES
      -- =====================================================

      -- Item Categories with valuation provider settings
      CREATE TABLE IF NOT EXISTS item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES item_categories(id),
        default_api_provider TEXT,
        condition_scale TEXT DEFAULT 'standard',
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Product Catalog - canonical products with external API IDs
      CREATE TABLE IF NOT EXISTS product_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pricecharting_id TEXT,
        tcgplayer_id TEXT,
        ebay_epid TEXT,
        stockx_id TEXT,
        name TEXT NOT NULL,
        category_id INTEGER REFERENCES item_categories(id),
        brand TEXT,
        model TEXT,
        year INTEGER,
        variant TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- API Valuations - cached API lookup results
      CREATE TABLE IF NOT EXISTS api_valuations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER REFERENCES product_catalog(id),
        item_id INTEGER REFERENCES Item(id),
        api_provider TEXT NOT NULL,
        api_item_id TEXT,
        condition_queried TEXT,
        value_cents INTEGER NOT NULL,
        currency TEXT DEFAULT 'USD',
        confidence_score INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
        sample_size INTEGER,
        price_range_low_cents INTEGER,
        price_range_high_cents INTEGER,
        raw_response TEXT,
        fetched_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );

      -- User Value Overrides - user-defined valuations
      CREATE TABLE IF NOT EXISTS user_value_overrides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES Item(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES User(id),
        override_value_cents INTEGER NOT NULL,
        reason TEXT,
        justification TEXT,
        evidence_urls TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES User(id),
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      -- Condition Assessments - structured condition data
      CREATE TABLE IF NOT EXISTS condition_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES Item(id) ON DELETE CASCADE,
        grade TEXT NOT NULL,
        completeness TEXT,
        packaging_condition TEXT,
        functionality TEXT,
        centering_score INTEGER CHECK (centering_score BETWEEN 0 AND 100),
        surface_score INTEGER CHECK (surface_score BETWEEN 0 AND 100),
        edges_score INTEGER CHECK (edges_score BETWEEN 0 AND 100),
        corners_score INTEGER CHECK (corners_score BETWEEN 0 AND 100),
        value_modifier_percent INTEGER DEFAULT 0,
        ai_assessed INTEGER DEFAULT 0,
        ai_confidence INTEGER,
        assessed_at TEXT DEFAULT (datetime('now')),
        assessed_by INTEGER REFERENCES User(id)
      );

      -- Trade Price Signals - historical pricing from completed trades
      CREATE TABLE IF NOT EXISTS trade_price_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        item_id INTEGER REFERENCES Item(id),
        product_id INTEGER REFERENCES product_catalog(id),
        category_id INTEGER REFERENCES item_categories(id),
        item_name TEXT NOT NULL,
        condition TEXT,
        implied_value_cents INTEGER NOT NULL,
        signal_confidence INTEGER CHECK (signal_confidence BETWEEN 0 AND 100),
        trade_completed_at TEXT NOT NULL
      );

      -- Indexes for valuation queries
      CREATE INDEX IF NOT EXISTS idx_api_valuations_product ON api_valuations(product_id, api_provider);
      CREATE INDEX IF NOT EXISTS idx_api_valuations_item ON api_valuations(item_id);
      CREATE INDEX IF NOT EXISTS idx_user_overrides_item ON user_value_overrides(item_id);
      CREATE INDEX IF NOT EXISTS idx_condition_item ON condition_assessments(item_id);
      CREATE INDEX IF NOT EXISTS idx_price_signals_product ON trade_price_signals(product_id);
      CREATE INDEX IF NOT EXISTS idx_price_signals_category ON trade_price_signals(category_id);
      CREATE INDEX IF NOT EXISTS idx_product_catalog_category ON product_catalog(category_id);
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
                const alicePass = bcrypt.hashSync('password123', 10);
                const bobPass = bcrypt.hashSync('password456', 10);
                db.exec(`
                  INSERT INTO User (name, email, password, rating, avatarUrl, balance) VALUES ('Alice', 'alice@example.com', '${alicePass}', 4.5, null, 20000), ('Bob', 'bob@example.com', '${bobPass}', 4.8, null, 5000);
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

// Non-destructive migration: ensure all required columns exist
const migrate = () => {
  return new Promise<void>((resolve, reject) => {
    const tasks: Promise<void>[] = [];

    // Helper to add column if it doesn't exist
    const addColumnIfMissing = (table: string, column: string, definition: string): Promise<void> => {
      return new Promise((res, rej) => {
        db.all(`PRAGMA table_info('${table}')`, (err, rows: any[]) => {
          if (err) return rej(err);
          const hasColumn = rows.some(r => r.name === column);
          if (!hasColumn) {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err) => {
              if (err) {
                console.log(`Migration: Column ${column} may already exist or error: ${err.message}`);
              }
              res();
            });
          } else {
            res();
          }
        });
      });
    };

    // Item table migrations
    db.all("PRAGMA table_info('Item')", (err, rows: any[]) => {
      if (err) return reject(err);

      const itemColumns = rows.map((r: any) => r.name);

      // Original migrations
      if (!itemColumns.includes('estimatedMarketValue')) {
        tasks.push(addColumnIfMissing('Item', 'estimatedMarketValue', 'INTEGER DEFAULT 0'));
      }

      // New valuation columns
      if (!itemColumns.includes('product_id')) {
        tasks.push(addColumnIfMissing('Item', 'product_id', 'INTEGER REFERENCES product_catalog(id)'));
      }
      if (!itemColumns.includes('category_id')) {
        tasks.push(addColumnIfMissing('Item', 'category_id', 'INTEGER REFERENCES item_categories(id)'));
      }
      if (!itemColumns.includes('condition')) {
        tasks.push(addColumnIfMissing('Item', 'condition', "TEXT DEFAULT 'GOOD'"));
      }
      if (!itemColumns.includes('emv_source')) {
        tasks.push(addColumnIfMissing('Item', 'emv_source', 'TEXT'));
      }
      if (!itemColumns.includes('emv_confidence')) {
        tasks.push(addColumnIfMissing('Item', 'emv_confidence', 'INTEGER'));
      }
      if (!itemColumns.includes('emv_updated_at')) {
        tasks.push(addColumnIfMissing('Item', 'emv_updated_at', 'TEXT'));
      }
      if (!itemColumns.includes('user_asking_cents')) {
        tasks.push(addColumnIfMissing('Item', 'user_asking_cents', 'INTEGER'));
      }
      if (!itemColumns.includes('status')) {
        tasks.push(addColumnIfMissing('Item', 'status', "TEXT DEFAULT 'active'"));
      }

      // User table migrations
      db.all("PRAGMA table_info('User')", (err2, userRows: any[]) => {
        if (err2) return reject(err2);
        const userColumns = userRows.map((r: any) => r.name);

        if (!userColumns.includes('balance')) {
          tasks.push(addColumnIfMissing('User', 'balance', 'INTEGER DEFAULT 0'));
        }

        Promise.all(tasks).then(() => resolve()).catch(reject);
      });
    });
  });
};

// Seed valuation data (categories and sample products)
const seedValuationData = () => {
  return new Promise<void>((resolve, reject) => {
    // Check if categories already seeded
    db.get('SELECT COUNT(*) as count FROM item_categories', (err, row: any) => {
      if (err) {
        console.log('item_categories table may not exist yet, skipping seed');
        return resolve();
      }
      if (row && row.count === 0) {
        db.exec(`
          -- Seed item categories
          INSERT INTO item_categories (slug, name, default_api_provider, condition_scale) VALUES 
            ('video-games', 'Video Games', 'pricecharting', 'standard'),
            ('tcg', 'Trading Card Games', 'tcgplayer', 'tcg'),
            ('sneakers', 'Sneakers', 'stockx', 'sneaker'),
            ('electronics', 'Electronics', null, 'standard'),
            ('other', 'Other', null, 'standard');

          -- Seed sample product catalog entries matching existing items
          INSERT INTO product_catalog (name, category_id, brand, model) VALUES 
            ('Gaming Laptop', 4, 'Generic', 'Laptop'),
            ('Wireless Mouse', 4, 'Generic', 'Mouse'),
            ('Mechanical Keyboard', 4, 'Generic', 'Keyboard'),
            ('27-inch Monitor', 4, 'Generic', 'Monitor');
          
          -- Seed video game products with PriceCharting IDs
          INSERT INTO product_catalog (name, category_id, brand, model, pricecharting_id) VALUES 
            ('EarthBound', 1, 'Super Nintendo', 'SNES', '6910'),
            ('Chrono Trigger', 1, 'Super Nintendo', 'SNES', '778'),
            ('Pokemon Red', 1, 'GameBoy', 'GB', '5152'),
            ('Legend of Zelda Ocarina of Time', 1, 'Nintendo 64', 'N64', '1484'),
            ('Super Mario World', 1, 'Super Nintendo', 'SNES', '6872');

          -- Link existing items to products and categories
          UPDATE Item SET category_id = 4, product_id = 1, condition = 'GOOD', emv_source = 'user_defined', status = 'active' WHERE name = 'Laptop';
          UPDATE Item SET category_id = 4, product_id = 2, condition = 'GOOD', emv_source = 'user_defined', status = 'active' WHERE name = 'Mouse';
          UPDATE Item SET category_id = 4, product_id = 3, condition = 'GOOD', emv_source = 'user_defined', status = 'active' WHERE name = 'Keyboard';
          UPDATE Item SET category_id = 4, product_id = 4, condition = 'GOOD', emv_source = 'user_defined', status = 'active' WHERE name = 'Monitor';
        `, (err) => {
          if (err) {
            console.error('Error seeding valuation data:', err);
          }

          // Also seed video game items for testing
          db.get('SELECT COUNT(*) as count FROM Item WHERE category_id = 1', (err2, row2: any) => {
            if (err2 || (row2 && row2.count > 0)) {
              return resolve();
            }

            db.exec(`
              -- Add sample video game items linked to products
              INSERT INTO Item (name, description, imageUrl, estimatedMarketValue, owner_id, category_id, product_id, condition, emv_source, status)
              VALUES 
                ('EarthBound', 'Classic SNES RPG - Cart Only', 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=200', 17244, 1, 1, 5, 'LOOSE', 'user_defined', 'active'),
                ('Chrono Trigger', 'Complete in Box - Great condition', 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=200', 35000, 1, 1, 6, 'CIB', 'user_defined', 'active'),
                ('Pokemon Red', 'Working save battery', 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=200', 4200, 2, 1, 7, 'LOOSE', 'user_defined', 'active'),
                ('Zelda Ocarina of Time', 'Gold Cart N64', 'https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=200', 3500, 2, 1, 8, 'LOOSE', 'user_defined', 'active');
            `, (err3) => {
              if (err3) console.error('Error seeding video game items:', err3);
              resolve();
            });
          });
        });
      } else {
        resolve();
      }
    });
  });
};

export { db, init, migrate, seedValuationData };