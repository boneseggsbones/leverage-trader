
import db from './db';
import { User, Item, Trade, TradeStatus } from '../types';
import { resetDb as resetMockDb, fetchAllUsers as fetchAllMockUsers, fetchAllItems as fetchAllMockItems, fetchAllTrades as fetchAllMockTrades } from './mockApi';

const insertInitialData = () => {
    resetMockDb();
    const mockUsers = fetchAllMockUsers();
    const mockItems = fetchAllMockItems();
    const mockTrades = fetchAllMockTrades();

    db.serialize(() => {
        const userStmt = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mockUsers.forEach(user => {
            userStmt.run(user.id, user.name, user.cash, user.valuationReputationScore, user.netTradeSurplus, user.city, user.state, JSON.stringify(user.interests), user.profilePictureUrl, user.aboutMe, user.accountCreatedAt, JSON.stringify(user.wishlist));
        });
        userStmt.finalize();

        const itemStmt = db.prepare("INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mockItems.forEach(item => {
            itemStmt.run(item.id, item.ownerId, item.name, item.category, item.condition, item.estimatedMarketValue, item.imageUrl, item.valuationSource, item.apiMetadata.apiName, item.apiMetadata.apiItemId, item.apiMetadata.baselineApiValue, item.apiMetadata.apiConditionUsed, item.apiMetadata.confidenceScore, item.apiMetadata.lastApiSyncTimestamp?.toISOString(), JSON.stringify(item.apiMetadata.rawDataSnapshot));
        });
        itemStmt.finalize();

        const tradeStmt = db.prepare("INSERT INTO trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        mockTrades.forEach(trade => {
            tradeStmt.run(trade.id, trade.proposerId, trade.receiverId, JSON.stringify(trade.proposerItemIds), JSON.stringify(trade.receiverItemIds), trade.proposerCash, trade.receiverCash, trade.status, trade.createdAt, trade.updatedAt, trade.disputeTicketId, trade.proposerSubmittedTracking, trade.receiverSubmittedTracking, trade.proposerTrackingNumber, trade.receiverTrackingNumber, trade.proposerVerifiedSatisfaction, trade.receiverVerifiedSatisfaction, trade.proposerRated, trade.receiverRated, trade.ratingDeadline);
        });
        tradeStmt.finalize();
    });
};

db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (row.count === 0) {
        insertInitialData();
    }
});


export const fetchItemsForUser = (userId: string): Promise<Item[]> => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM items WHERE ownerId = ?", [userId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const items: Item[] = rows.map(row => ({
                    id: row.id,
                    ownerId: row.ownerId,
                    name: row.name,
                    category: row.category,
                    condition: row.condition,
                    estimatedMarketValue: row.estimatedMarketValue,
                    imageUrl: row.imageUrl,
                    valuationSource: row.valuationSource,
                    apiMetadata: {
                        apiName: row.apiName,
                        apiItemId: row.apiItemId,
                        baselineApiValue: row.baselineApiValue,
                        apiConditionUsed: row.apiConditionUsed,
                        confidenceScore: row.confidenceScore,
                        lastApiSyncTimestamp: row.lastApiSyncTimestamp ? new Date(row.lastApiSyncTimestamp) : null,
                        rawDataSnapshot: JSON.parse(row.rawDataSnapshot),
                    }
                }));
                resolve(items);
            }
        });
    });
}

export const fetchAllUsers = (): Promise<User[]> => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM users", async (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const users: User[] = await Promise.all(rows.map(async row => {
                    const inventory = await fetchItemsForUser(row.id);
                    return {
                        id: row.id,
                        name: row.name,
                        inventory: inventory,
                        cash: row.cash,
                        valuationReputationScore: row.valuationReputationScore,
                        netTradeSurplus: row.netTradeSurplus,
                        city: row.city,
                        state: row.state,
                        interests: JSON.parse(row.interests),
                        profilePictureUrl: row.profilePictureUrl,
                        aboutMe: row.aboutMe,
                        accountCreatedAt: row.accountCreatedAt,
                        wishlist: JSON.parse(row.wishlist),
                    }
                }));
                resolve(users);
            }
        });
    });
};

export const fetchUser = (id: string): Promise<User | undefined> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM users WHERE id = ?", [id], async (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                const inventory = await fetchItemsForUser(row.id);
                const user: User = {
                    id: row.id,
                    name: row.name,
                    inventory: inventory,
                    cash: row.cash,
                    valuationReputationScore: row.valuationReputationScore,
                    netTradeSurplus: row.netTradeSurplus,
                    city: row.city,
                    state: row.state,
                    interests: JSON.parse(row.interests),
                    profilePictureUrl: row.profilePictureUrl,
                    aboutMe: row.aboutMe,
                    accountCreatedAt: row.accountCreatedAt,
                    wishlist: JSON.parse(row.wishlist),
                };
                resolve(user);
            } else {
                resolve(undefined);
            }
        });
    });
};

export const fetchAllItems = (): Promise<Item[]> => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM items", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const items: Item[] = rows.map(row => ({
                    id: row.id,
                    ownerId: row.ownerId,
                    name: row.name,
                    category: row.category,
                    condition: row.condition,
                    estimatedMarketValue: row.estimatedMarketValue,
                    imageUrl: row.imageUrl,
                    valuationSource: row.valuationSource,
                    apiMetadata: {
                        apiName: row.apiName,
                        apiItemId: row.apiItemId,
                        baselineApiValue: row.baselineApiValue,
                        apiConditionUsed: row.apiConditionUsed,
                        confidenceScore: row.confidenceScore,
                        lastApiSyncTimestamp: row.lastApiSyncTimestamp ? new Date(row.lastApiSyncTimestamp) : null,
                        rawDataSnapshot: JSON.parse(row.rawDataSnapshot),
                    }
                }));
                resolve(items);
            }
        });
    });
}

export const fetchTradesForUser = (userId: string): Promise<Trade[]> => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM trades WHERE proposerId = ? OR receiverId = ?", [userId, userId], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const trades: Trade[] = rows.map(row => ({
                    id: row.id,
                    proposerId: row.proposerId,
                    receiverId: row.receiverId,
                    proposerItemIds: JSON.parse(row.proposerItemIds),
                    receiverItemIds: JSON.parse(row.receiverItemIds),
                    proposerCash: row.proposerCash,
                    receiverCash: row.receiverCash,
                    status: row.status,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    disputeTicketId: row.disputeTicketId,
                    proposerSubmittedTracking: !!row.proposerSubmittedTracking,
                    receiverSubmittedTracking: !!row.receiverSubmittedTracking,
                    proposerTrackingNumber: row.proposerTrackingNumber,
                    receiverTrackingNumber: row.receiverTrackingNumber,
                    proposerVerifiedSatisfaction: !!row.proposerVerifiedSatisfaction,
                    receiverVerifiedSatisfaction: !!row.receiverVerifiedSatisfaction,
                    proposerRated: !!row.proposerRated,
                    receiverRated: !!row.receiverRated,
                    ratingDeadline: row.ratingDeadline,
                }));
                resolve(trades);
            }
        });
    });
};

export const fetchCompletedTradesForUser = (userId: string): Promise<Trade[]> => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM trades WHERE (proposerId = ? OR receiverId = ?) AND status = ?", [userId, userId, TradeStatus.COMPLETED], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const trades: Trade[] = rows.map(row => ({
                    id: row.id,
                    proposerId: row.proposerId,
                    receiverId: row.receiverId,
                    proposerItemIds: JSON.parse(row.proposerItemIds),
                    receiverItemIds: JSON.parse(row.receiverItemIds),
                    proposerCash: row.proposerCash,
                    receiverCash: row.receiverCash,
                    status: row.status,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    disputeTicketId: row.disputeTicketId,
                    proposerSubmittedTracking: !!row.proposerSubmittedTracking,
                    receiverSubmittedTracking: !!row.receiverSubmittedTracking,
                    proposerTrackingNumber: row.proposerTrackingNumber,
                    receiverTrackingNumber: row.receiverTrackingNumber,
                    proposerVerifiedSatisfaction: !!row.proposerVerifiedSatisfaction,
                    receiverVerifiedSatisfaction: !!row.receiverVerifiedSatisfaction,
                    proposerRated: !!row.proposerRated,
                    receiverRated: !!row.receiverRated,
                    ratingDeadline: row.ratingDeadline,
                }));
                resolve(trades);
            }
        });
    });
};

export const proposeTrade = (proposerId: string, receiverId: string, proposerItemIds: string[], receiverItemIds: string[], proposerCash: number): Promise<{ updatedProposer: User }> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM users WHERE id = ?", [proposerId], (err, proposer) => {
            if (err) {
                reject(err);
            } else if (proposer) {
                if (proposer.cash < proposerCash) {
                    reject(new Error("Insufficient funds"));
                } else {
                    const newTrade: Trade = {
                        id: `trade-${Date.now()}`,
                        proposerId,
                        receiverId,
                        proposerItemIds,
                        receiverItemIds,
                        proposerCash,
                        receiverCash: 0,
                        status: TradeStatus.PENDING_ACCEPTANCE,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        disputeTicketId: null,
                        proposerSubmittedTracking: false,
                        receiverSubmittedTracking: false,
                        proposerTrackingNumber: null,
                        receiverTrackingNumber: null,
                        proposerVerifiedSatisfaction: false,
                        receiverVerifiedSatisfaction: false,
                        proposerRated: false,
                        receiverRated: false,
                        ratingDeadline: null,
                    };

                    db.run("INSERT INTO trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [newTrade.id, newTrade.proposerId, newTrade.receiverId, JSON.stringify(newTrade.proposerItemIds), JSON.stringify(newTrade.receiverItemIds), newTrade.proposerCash, newTrade.receiverCash, newTrade.status, newTrade.createdAt, newTrade.updatedAt, newTrade.disputeTicketId, newTrade.proposerSubmittedTracking, newTrade.receiverSubmittedTracking, newTrade.proposerTrackingNumber, newTrade.receiverTrackingNumber, newTrade.proposerVerifiedSatisfaction, newTrade.receiverVerifiedSatisfaction, newTrade.proposerRated, newTrade.receiverRated, newTrade.ratingDeadline], async (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            const updatedProposer = await fetchUser(proposerId);
                            resolve({ updatedProposer: updatedProposer! });
                        }
                    });
                }
            } else {
                reject(new Error("Proposer not found"));
            }
        });
    });
};

export const respondToTrade = (tradeId: string, response: 'accept' | 'reject'): Promise<Trade> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM trades WHERE id = ?", [tradeId], (err, trade) => {
            if (err) {
                reject(err);
            } else if (trade) {
                if (trade.status !== TradeStatus.PENDING_ACCEPTANCE) {
                    reject(new Error("Trade not found or not pending"));
                } else {
                    if (response === 'reject') {
                        db.run("UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?", [TradeStatus.REJECTED, new Date().toISOString(), tradeId], (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({ ...trade, status: TradeStatus.REJECTED });
                            }
                        });
                    } else {
                        // Handle acceptance
                        db.get("SELECT * FROM users WHERE id = ?", [trade.proposerId], (err, proposer) => {
                            if (err) reject(err);
                            db.get("SELECT * FROM users WHERE id = ?", [trade.receiverId], (err, receiver) => {
                                if (err) reject(err);

                                // This is a simplified version of the logic in mockApi.ts
                                // A full implementation would require fetching all items to calculate values
                                
                                db.serialize(() => {
                                    db.run("UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?", [TradeStatus.COMPLETED_AWAITING_RATING, new Date().toISOString(), tradeId]);
                                    
                                    // Item and cash swap logic would go here
                                    
                                    resolve({ ...trade, status: TradeStatus.COMPLETED_AWAITING_RATING });
                                });
                            });
                        });
                    }
                }
            } else {
                reject(new Error("Trade not found"));
            }
        });
    });
};

export const cancelTrade = (tradeId: string, userId: string): Promise<Trade> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM trades WHERE id = ?", [tradeId], (err, trade) => {
            if (err) {
                reject(err);
            } else if (trade) {
                if (trade.proposerId !== userId) {
                    reject(new Error("Only the proposer can cancel"));
                } else if (trade.status !== TradeStatus.PENDING_ACCEPTANCE) {
                    reject(new Error("Can only cancel pending trades"));
                } else {
                    db.run("UPDATE trades SET status = ?, updatedAt = ? WHERE id = ?", [TradeStatus.CANCELLED, new Date().toISOString(), tradeId], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ ...trade, status: TradeStatus.CANCELLED });
                        }
                    });
                }
            } else {
                reject(new Error("Trade not found"));
            }
        });
    });
};

export const toggleWishlistItem = (userId: string, itemId: string): Promise<User> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
            if (err) {
                reject(err);
            } else if (user) {
                const wishlist = JSON.parse(user.wishlist);
                const index = wishlist.indexOf(itemId);
                if (index > -1) {
                    wishlist.splice(index, 1);
                } else {
                    wishlist.push(itemId);
                }
                db.run("UPDATE users SET wishlist = ? WHERE id = ?", [JSON.stringify(wishlist), userId], async (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        const updatedUser = await fetchUser(userId);
                        resolve(updatedUser!);
                    }
                });
            } else {
                reject(new Error("User not found"));
            }
        });
    });
};

export const verifySatisfaction = (tradeId: string, userId: string): Promise<{proposer: User, receiver: User}> => {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM trades WHERE id = ?", [tradeId], (err, trade) => {
            if (err) {
                reject(err);
            } else if (trade) {
                let proposerVerified = trade.proposerVerifiedSatisfaction;
                let receiverVerified = trade.receiverVerifiedSatisfaction;

                if (trade.proposerId === userId) {
                    proposerVerified = true;
                }
                if (trade.receiverId === userId) {
                    receiverVerified = true;
                }

                db.run("UPDATE trades SET proposerVerifiedSatisfaction = ?, receiverVerifiedSatisfaction = ? WHERE id = ?", [proposerVerified, receiverVerified, tradeId], (err) => {
                    if (err) reject(err);

                    if (proposerVerified && receiverVerified) {
                        // Simplified logic from mockApi
                        db.run("UPDATE trades SET status = ? WHERE id = ?", [TradeStatus.COMPLETED_AWAITING_RATING, tradeId], async (err) => {
                            if (err) reject(err);
                            
                            const proposer = await fetchUser(trade.proposerId);
                            const receiver = await fetchUser(trade.receiverId);

                            // In a real app, you would do the item and cash swap here
                            
                            resolve({proposer: proposer!, receiver: receiver!});
                        });
                    } else {
                        // Return the users without modification if not both have verified
                        db.get("SELECT * FROM users WHERE id = ?", [trade.proposerId], async (err, proposerRow) => {
                            const proposer = await fetchUser(proposerRow.id);
                            db.get("SELECT * FROM users WHERE id = ?", [trade.receiverId], async (err, receiverRow) => {
                                const receiver = await fetchUser(receiverRow.id);
                                resolve({proposer: proposer!, receiver: receiver!});
                            });
                        });
                    }
                });
            } else {
                reject(new Error("Trade not found"));
            }
        });
    });
};
