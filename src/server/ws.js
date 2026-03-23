import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import WebSocket from 'ws';

/**
 * Setup WebSocket server logic
 * @param {WebSocketServer} wss 
 * @param {Object} configs App configurations and auth tokens
 */
export function setupWebSocket(wss, { 
    AUTH_COOKIE_NAME, 
    AUTH_TOKEN, 
    SESSION_SECRET, 
    isLocalRequest 
}) {
    wss.on('connection', (ws, req) => {
        // Parse cookies from headers
        const rawCookies = req.headers.cookie || '';
        const parsedCookies = {};
        rawCookies.split(';').forEach(c => {
            const [k, v] = c.trim().split('=');
            if (k && v) {
                try {
                    parsedCookies[k] = decodeURIComponent(v);
                } catch (e) {
                    parsedCookies[k] = v;
                }
            }
        });

        // Verify signed cookie manually
        const signedToken = parsedCookies[AUTH_COOKIE_NAME];
        let isAuthenticated = false;

        // Exempt local Wi-Fi devices from authentication
        if (isLocalRequest(req)) {
            isAuthenticated = true;
        } else if (signedToken) {
            const token = cookieParser.signedCookie(signedToken, SESSION_SECRET);
            if (token === AUTH_TOKEN) {
                isAuthenticated = true;
            }
        }

        if (!isAuthenticated) {
            console.log('🚫 Unauthorized WebSocket connection attempt');
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
            setTimeout(() => ws.close(), 100);
            return;
        }

        console.log('📱 Client connected (Authenticated)');

        ws.on('close', () => {
            console.log('📱 Client disconnected');
        });
    });

    /**
     * Broadcast a snapshot update to all connected clients
     */
    function broadcastUpdate(hash) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'snapshot_update',
                    timestamp: new Date().toISOString(),
                    hash: hash
                }));
            }
        });
    }

    /**
     * Broadcast a selector error to all connected clients
     */
    function broadcastSelectorError(report) {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'selector_error',
                    data: report
                }));
            }
        });
    }

    return { broadcastUpdate, broadcastSelectorError };
}
