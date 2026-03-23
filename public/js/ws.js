/**
 * WebSocket Management and Heartbeat
 */

import { fetchWithAuth } from './api.js';

let socket = null;
let pollInterval = null;
let isConnected = false;
const callbacks = new Set();

/**
 * Initialize WebSocket connection
 */
export function initWS(onMessage) {
    if (onMessage) callbacks.add(onMessage);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log('✅ WebSocket Connected');
        isConnected = true;
        document.body.classList.add('ws-connected');
        if (pollInterval) clearInterval(pollInterval);
    };

    socket.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'snapshot_update') {
                // Fetch the actual snapshot data when notified of an update
                const t = Date.now();
                const res = await fetchWithAuth(`/snapshot?t=${t}`);
                const data = await res.json();
                if (data && !data.error) {
                    callbacks.forEach(cb => cb({ type: 'snapshot', data }));
                }
            } else if (message.type === 'selector_error') {
                callbacks.forEach(cb => cb(message));
            } else {
                // Pass through other message types (like 'snapshot' or 'state')
                callbacks.forEach(cb => cb(message));
            }
        } catch (e) {
            console.error('WS Message Parse Error:', e);
        }
    };

    socket.onclose = () => {
        console.warn('❌ WebSocket Disconnected. Polling instead.');
        isConnected = false;
        document.body.classList.remove('ws-connected');
        startPolling();
    };

    socket.onerror = (err) => {
        console.error('WS Error:', err);
    };

    return socket;
}

/**
 * Fallback polling when WebSocket is down
 */
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        if (isConnected) return;
        try {
            const t = Date.now();
            const res = await fetchWithAuth(`/snapshot?t=${t}`);
            const data = await res.json();
            if (data && !data.error) {
                callbacks.forEach(cb => cb({ type: 'snapshot', data }));
            }
        } catch (e) {}
    }, 2000);
}

/**
 * Send a message through WebSocket
 */
export function sendWS(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
        return true;
    }
    return false;
}
