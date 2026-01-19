/**
 * WebSocket Server for Real-Time Notifications
 * Manages client connections and broadcasts notifications to users
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface ClientConnection {
    ws: WebSocket;
    userId: string;
}

// Track connected clients by userId
const clients: Map<string, Set<WebSocket>> = new Map();

let wss: WebSocketServer | null = null;

/**
 * Initialize WebSocket server attached to HTTP server
 */
export function initWebSocket(server: Server): WebSocketServer {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws: WebSocket, req) => {
        console.log('[WebSocket] New connection');

        let userId: string | null = null;

        ws.on('message', (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());

                // Handle authentication/registration
                if (data.type === 'register' && data.userId) {
                    userId = String(data.userId);

                    // Add to clients map
                    if (!clients.has(userId)) {
                        clients.set(userId, new Set());
                    }
                    clients.get(userId)!.add(ws);

                    console.log(`[WebSocket] User ${userId} registered. Total connections: ${clients.get(userId)!.size}`);

                    // Send confirmation
                    ws.send(JSON.stringify({ type: 'registered', userId }));
                }
            } catch (err) {
                console.error('[WebSocket] Error parsing message:', err);
            }
        });

        ws.on('close', () => {
            if (userId && clients.has(userId)) {
                clients.get(userId)!.delete(ws);
                if (clients.get(userId)!.size === 0) {
                    clients.delete(userId);
                }
                console.log(`[WebSocket] User ${userId} disconnected`);
            }
        });

        ws.on('error', (err) => {
            console.error('[WebSocket] Error:', err);
        });
    });

    console.log('[WebSocket] Server initialized on /ws');
    return wss;
}

/**
 * Broadcast a message to all connections for a specific user
 */
export function broadcastToUser(userId: string | number, data: any): void {
    const userIdStr = String(userId);
    const userClients = clients.get(userIdStr);

    if (!userClients || userClients.size === 0) {
        console.log(`[WebSocket] No active connections for user ${userIdStr}`);
        return;
    }

    const message = JSON.stringify(data);
    let sent = 0;

    userClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
            sent++;
        }
    });

    console.log(`[WebSocket] Broadcast to user ${userIdStr}: ${sent}/${userClients.size} connections`);
}

/**
 * Get count of connected clients (for debugging)
 */
export function getConnectionCount(): number {
    let total = 0;
    clients.forEach((set) => {
        total += set.size;
    });
    return total;
}
