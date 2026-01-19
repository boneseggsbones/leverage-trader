/**
 * WebSocket Hook for Real-Time Notifications
 * Manages WebSocket connection to backend with auto-reconnect
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface WebSocketMessage {
    type: string;
    [key: string]: any;
}

interface UseWebSocketOptions {
    userId: string | number | null;
    onMessage?: (message: WebSocketMessage) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
}

const WS_URL = 'ws://localhost:4000/ws';
const RECONNECT_DELAY = 3000; // 3 seconds

export function useWebSocket({ userId, onMessage, onConnect, onDisconnect }: UseWebSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const connect = useCallback(() => {
        if (!userId) return;

        // Clean up existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        console.log('[WebSocket] Connecting...');
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log('[WebSocket] Connected');
            setIsConnected(true);
            onConnect?.();

            // Register the user
            ws.send(JSON.stringify({
                type: 'register',
                userId: String(userId)
            }));
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as WebSocketMessage;
                console.log('[WebSocket] Received:', data.type);
                onMessage?.(data);
            } catch (err) {
                console.error('[WebSocket] Failed to parse message:', err);
            }
        };

        ws.onclose = () => {
            console.log('[WebSocket] Disconnected');
            setIsConnected(false);
            onDisconnect?.();

            // Auto-reconnect
            reconnectTimeoutRef.current = setTimeout(() => {
                console.log('[WebSocket] Reconnecting...');
                connect();
            }, RECONNECT_DELAY);
        };

        ws.onerror = (error) => {
            console.error('[WebSocket] Error:', error);
        };

        wsRef.current = ws;
    }, [userId, onMessage, onConnect, onDisconnect]);

    // Connect when userId changes
    useEffect(() => {
        if (userId) {
            connect();
        }

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [userId, connect]);

    // Send a message through the WebSocket
    const sendMessage = useCallback((message: WebSocketMessage) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        } else {
            console.warn('[WebSocket] Cannot send, not connected');
        }
    }, []);

    return {
        isConnected,
        sendMessage
    };
}
