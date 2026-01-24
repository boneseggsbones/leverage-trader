import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';

// Database isolation: Use test.sqlite when running tests to prevent data contamination
const isTestEnv = process.env.NODE_ENV === 'test';
const DBSOURCE = isTestEnv ? 'test.sqlite' : 'db.sqlite';

if (isTestEnv) {
  console.log('[Database] Running in TEST mode - using test.sqlite');
}

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
        ratingDeadline TEXT,
        parentTradeId TEXT,
        counterMessage TEXT
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

      -- Escrow holds for provider-agnostic payment system
      CREATE TABLE IF NOT EXISTS escrow_holds (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL,
        payer_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        provider TEXT NOT NULL DEFAULT 'mock',
        provider_reference TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (payer_id) REFERENCES User(id),
        FOREIGN KEY (recipient_id) REFERENCES User(id)
      );
      CREATE INDEX IF NOT EXISTS idx_escrow_holds_trade ON escrow_holds(trade_id);
      CREATE INDEX IF NOT EXISTS idx_escrow_holds_status ON escrow_holds(status);

      -- Shipment tracking for delivery status
      CREATE TABLE IF NOT EXISTS shipment_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        tracking_number TEXT NOT NULL,
        carrier TEXT,
        status TEXT DEFAULT 'LABEL_CREATED',
        status_detail TEXT,
        location TEXT,
        estimated_delivery TEXT,
        delivered_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_updated TEXT DEFAULT (datetime('now')),
        UNIQUE(trade_id, user_id),
        FOREIGN KEY (user_id) REFERENCES User(id)
      );
      CREATE INDEX IF NOT EXISTS idx_shipment_trade ON shipment_tracking(trade_id);

      -- User notifications for trade events
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        trade_id TEXT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

      -- User email notification preferences
      CREATE TABLE IF NOT EXISTS email_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES User(id),
        trade_proposed INTEGER DEFAULT 1,
        trade_accepted INTEGER DEFAULT 1,
        escrow_funded INTEGER DEFAULT 1,
        trade_completed INTEGER DEFAULT 1,
        counter_offer INTEGER DEFAULT 1,
        dispute_opened INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- User payment methods for cash portions of trades
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES User(id),
        provider TEXT NOT NULL, -- 'stripe_card', 'stripe_bank', 'venmo', 'paypal', 'coinbase'
        provider_account_id TEXT, -- Stripe payment method ID or external account ID
        display_name TEXT NOT NULL, -- "Visa ****1234" or "@username"
        is_default INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
        metadata TEXT, -- JSON for extra provider-specific data
        connected_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT,
        -- Stripe-specific fields
        stripe_payment_method_id TEXT,
        stripe_customer_id TEXT,
        last_four TEXT,
        brand TEXT,
        -- Plaid-specific fields (encrypted in production)
        plaid_access_token TEXT,
        plaid_account_id TEXT,
        -- OAuth provider fields
        oauth_access_token TEXT,
        oauth_refresh_token TEXT,
        oauth_expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(user_id, is_default);

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

      -- =====================================================
      -- TRADE GRAPH FOUNDATION TABLES (Phase 0+1)
      -- =====================================================

      -- Activity events for behavioral signals (Phase 0)
      CREATE TABLE IF NOT EXISTS user_activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES User(id),
        event_type TEXT NOT NULL,
        target_item_id INTEGER REFERENCES Item(id),
        target_user_id INTEGER REFERENCES User(id),
        search_query TEXT,
        category_id INTEGER REFERENCES item_categories(id),
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_type ON user_activity_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_activity_item ON user_activity_events(target_item_id);

      -- Explicit watch requests (Phase 1)
      CREATE TABLE IF NOT EXISTS user_wants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES User(id),
        want_type TEXT NOT NULL,
        item_id INTEGER REFERENCES Item(id),
        search_term TEXT,
        category_id INTEGER REFERENCES item_categories(id),
        min_price_cents INTEGER,
        max_price_cents INTEGER,
        notify_on_match INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        matched_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_wants_user ON user_wants(user_id);
      CREATE INDEX IF NOT EXISTS idx_wants_active ON user_wants(is_active, notify_on_match);
      CREATE INDEX IF NOT EXISTS idx_wants_category ON user_wants(category_id);

      -- =====================================================
      -- EBAY IMPORT TABLES
      -- =====================================================

      -- User eBay OAuth tokens
      CREATE TABLE IF NOT EXISTS ebay_user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES User(id),
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expires_at TEXT NOT NULL,
        ebay_user_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ebay_tokens_user ON ebay_user_tokens(user_id);

      -- Track imported eBay items to prevent duplicates
      CREATE TABLE IF NOT EXISTS ebay_imported_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES User(id),
        ebay_item_id TEXT NOT NULL,
        leverage_item_id INTEGER REFERENCES Item(id),
        imported_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, ebay_item_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ebay_imported_user ON ebay_imported_items(user_id);

      -- =====================================================
      -- PSA CERTIFICATION CACHE TABLE
      -- =====================================================
      
      -- Cache PSA certification verifications (7-day cache)
      CREATE TABLE IF NOT EXISTS psa_certifications (
        cert_number TEXT PRIMARY KEY,
        grade TEXT NOT NULL,
        grade_description TEXT,
        qualifier TEXT,
        label_type TEXT,
        year TEXT,
        brand TEXT,
        set_name TEXT,
        card_number TEXT,
        subject TEXT,
        variety TEXT,
        population INTEGER DEFAULT 0,
        population_higher INTEGER DEFAULT 0,
        last_checked TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_psa_cert_grade ON psa_certifications(grade);

      -- =====================================================
      -- CHAIN TRADE TABLES
      -- =====================================================

      -- Chain trade proposals (parent container for multi-party trades)
      CREATE TABLE IF NOT EXISTS chain_proposals (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        total_value_cents INTEGER NOT NULL,
        value_tolerance_percent INTEGER DEFAULT 15,
        max_participants INTEGER DEFAULT 3,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT,
        executed_at TEXT,
        failed_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chain_proposals_status ON chain_proposals(status);

      -- Chain participants (one row per user in chain)
      CREATE TABLE IF NOT EXISTS chain_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chain_id TEXT NOT NULL REFERENCES chain_proposals(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES User(id),
        gives_item_id INTEGER NOT NULL REFERENCES Item(id),
        receives_item_id INTEGER NOT NULL REFERENCES Item(id),
        gives_to_user_id INTEGER NOT NULL REFERENCES User(id),
        receives_from_user_id INTEGER NOT NULL REFERENCES User(id),
        cash_delta INTEGER DEFAULT 0,
        has_accepted INTEGER DEFAULT 0,
        has_funded INTEGER DEFAULT 0,
        has_shipped INTEGER DEFAULT 0,
        tracking_number TEXT,
        carrier TEXT,
        has_received INTEGER DEFAULT 0,
        accepted_at TEXT,
        shipped_at TEXT,
        received_at TEXT,
        UNIQUE(chain_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_chain_participants_chain ON chain_participants(chain_id);
      CREATE INDEX IF NOT EXISTS idx_chain_participants_user ON chain_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_chain_participants_item ON chain_participants(gives_item_id);

      -- P2 FIX: Rejected chains cooldown (prevent "Zombie" chains from being re-proposed)
      CREATE TABLE IF NOT EXISTS rejected_chains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_hash TEXT NOT NULL UNIQUE,  -- Hash of participants/items to identify duplicate cycles
        rejected_by_user_id INTEGER NOT NULL REFERENCES User(id),
        original_chain_id TEXT REFERENCES chain_proposals(id),
        rejected_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,  -- 30-day cooldown
        reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rejected_chains_hash ON rejected_chains(cycle_hash);
      CREATE INDEX IF NOT EXISTS idx_rejected_chains_expires ON rejected_chains(expires_at);
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
      // PSA certification columns
      if (!itemColumns.includes('psa_cert_number')) {
        tasks.push(addColumnIfMissing('Item', 'psa_cert_number', 'TEXT'));
      }
      if (!itemColumns.includes('psa_grade')) {
        tasks.push(addColumnIfMissing('Item', 'psa_grade', 'TEXT'));
      }
      // Store original API value when user overrides
      if (!itemColumns.includes('original_api_value_cents')) {
        tasks.push(addColumnIfMissing('Item', 'original_api_value_cents', 'INTEGER'));
      }

      // User table migrations
      db.all("PRAGMA table_info('User')", (err2, userRows: any[]) => {
        if (err2) return reject(err2);
        const userColumns = userRows.map((r: any) => r.name);

        if (!userColumns.includes('balance')) {
          tasks.push(addColumnIfMissing('User', 'balance', 'INTEGER DEFAULT 0'));
        }
        if (!userColumns.includes('city')) {
          tasks.push(addColumnIfMissing('User', 'city', 'TEXT'));
        }
        if (!userColumns.includes('state')) {
          tasks.push(addColumnIfMissing('User', 'state', 'TEXT'));
        }
        if (!userColumns.includes('aboutMe')) {
          tasks.push(addColumnIfMissing('User', 'aboutMe', 'TEXT'));
        }
        if (!userColumns.includes('valuationReputationScore')) {
          tasks.push(addColumnIfMissing('User', 'valuationReputationScore', 'INTEGER DEFAULT 100'));
        }
        if (!userColumns.includes('profilePictureUrl')) {
          tasks.push(addColumnIfMissing('User', 'profilePictureUrl', 'TEXT'));
        }
        if (!userColumns.includes('createdAt')) {
          tasks.push(addColumnIfMissing('User', 'createdAt', 'TEXT'));
        }
        if (!userColumns.includes('isAdmin')) {
          tasks.push(addColumnIfMissing('User', 'isAdmin', 'INTEGER DEFAULT 0'));
        }
        // Coordinates for distance calculation
        if (!userColumns.includes('lat')) {
          tasks.push(addColumnIfMissing('User', 'lat', 'REAL'));
        }
        if (!userColumns.includes('lng')) {
          tasks.push(addColumnIfMissing('User', 'lng', 'REAL'));
        }
        if (!userColumns.includes('zipCode')) {
          tasks.push(addColumnIfMissing('User', 'zipCode', 'TEXT'));
        }
        // Contact information
        if (!userColumns.includes('phone')) {
          tasks.push(addColumnIfMissing('User', 'phone', 'TEXT'));
        }

        // =====================================================
        // SUBSCRIPTION & MONETIZATION MIGRATIONS
        // =====================================================
        if (!userColumns.includes('subscription_tier')) {
          tasks.push(addColumnIfMissing('User', 'subscription_tier', "TEXT DEFAULT 'FREE'"));
        }
        if (!userColumns.includes('subscription_status')) {
          tasks.push(addColumnIfMissing('User', 'subscription_status', "TEXT DEFAULT 'none'"));
        }
        if (!userColumns.includes('subscription_renews_at')) {
          tasks.push(addColumnIfMissing('User', 'subscription_renews_at', 'TEXT'));
        }
        if (!userColumns.includes('subscription_stripe_id')) {
          tasks.push(addColumnIfMissing('User', 'subscription_stripe_id', 'TEXT'));
        }
        if (!userColumns.includes('trades_this_cycle')) {
          tasks.push(addColumnIfMissing('User', 'trades_this_cycle', 'INTEGER DEFAULT 0'));
        }
        if (!userColumns.includes('cycle_started_at')) {
          tasks.push(addColumnIfMissing('User', 'cycle_started_at', 'TEXT'));
        }
        if (!userColumns.includes('stripe_customer_id')) {
          tasks.push(addColumnIfMissing('User', 'stripe_customer_id', 'TEXT'));
        }

        // Trade fee columns
        db.all("PRAGMA table_info('trades')", (err3, tradeRows: any[]) => {
          if (err3) return reject(err3);
          const tradeColumns = tradeRows.map((r: any) => r.name);

          if (!tradeColumns.includes('platform_fee_cents')) {
            tasks.push(addColumnIfMissing('trades', 'platform_fee_cents', 'INTEGER DEFAULT 0'));
          }
          if (!tradeColumns.includes('is_fee_waived')) {
            tasks.push(addColumnIfMissing('trades', 'is_fee_waived', 'INTEGER DEFAULT 0'));
          }
          if (!tradeColumns.includes('fee_payer_id')) {
            tasks.push(addColumnIfMissing('trades', 'fee_payer_id', 'TEXT'));
          }

          // user_value_overrides migrations
          tasks.push(addColumnIfMissing('user_value_overrides', 'original_api_value_cents', 'INTEGER'));

          // =====================================================
          // CHAIN TRADE SHIPPING PHOTO SCHEMA (Task 3.1)
          // =====================================================
          // Add shipping photo URL for proof-of-shipping verification
          tasks.push(addColumnIfMissing('chain_participants', 'shipping_photo_url', 'TEXT'));
          // Store raw carrier API responses for dispute resolution
          tasks.push(addColumnIfMissing('chain_participants', 'carrier_status_raw', 'TEXT'));

          Promise.all(tasks).then(() => resolve()).catch(reject);
        });
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