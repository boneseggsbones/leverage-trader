
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./leverage.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the leverage database.');
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cash INTEGER NOT NULL,
            valuationReputationScore INTEGER NOT NULL,
            netTradeSurplus INTEGER NOT NULL,
            city TEXT NOT NULL,
            state TEXT NOT NULL,
            interests TEXT NOT NULL,
            profilePictureUrl TEXT NOT NULL,
            aboutMe TEXT NOT NULL,
            accountCreatedAt TEXT NOT NULL,
            wishlist TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            condition TEXT NOT NULL,
            estimatedMarketValue INTEGER NOT NULL,
            imageUrl TEXT NOT NULL,
            valuationSource TEXT NOT NULL,
            apiName TEXT,
            apiItemId TEXT,
            baselineApiValue INTEGER,
            apiConditionUsed TEXT,
            confidenceScore INTEGER,
            lastApiSyncTimestamp TEXT,
            rawDataSnapshot TEXT,
            FOREIGN KEY (ownerId) REFERENCES users (id)
        )
    `);

    db.run(`
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
            FOREIGN KEY (proposerId) REFERENCES users (id),
            FOREIGN KEY (receiverId) REFERENCES users (id)
        )
    `);
});

export default db;
