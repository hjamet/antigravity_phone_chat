#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { WebSocketServer } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import os from 'os';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { inspectUI } from './src/cdp/ui_inspector.js';
import { execSync } from 'child_process';

// Modular CDP Scripts
import * as workbenchCdp from './src/cdp/workbench.js';
import * as managerCdp from './src/cdp/manager.js';

// Modular Server Logic
import { setupRoutes } from './src/server/routes.js';
import { setupWebSocket } from './src/server/ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORTS = [9000, 9001, 9002, 9003];
const POLL_INTERVAL = 1000;
const SERVER_PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'antigravity';
const AUTH_COOKIE_NAME = 'ag_auth_token';
let AUTH_TOKEN = 'ag_default_token';

// Shared State
const cdpConnections = { workbench: null, manager: null };
let lastSnapshot = { data: null };
let lastSnapshotHash = null;
// Cache the last significant agent message (> 300 chars) to survive DOM virtualization
let cachedAgentMsg = null;

/**
 * Simple hash function for change detection
 */
function hashString(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(16);
}

/**
 * Check if the request is from a local address
 */
function isLocalRequest(req) {
    const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
}

// --- CDP Discovery & Connection ---

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function discoverCDP() {
    const targets = { workbench: null, manager: null };
    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);
            const workbench = list.find(t => t.url?.includes('workbench.html') || t.title?.includes('workbench'));
            const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad' || t.url?.includes('jetski'));
            
            if (workbench && !targets.workbench) targets.workbench = { port, url: workbench.webSocketDebuggerUrl };
            if (manager && !targets.manager) targets.manager = { port, url: manager.webSocketDebuggerUrl };
        } catch (e) {}
    }
    return targets;
}

async function connectCDP(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    let idCounter = 1;
    const pendingCalls = new Map();
    const contexts = [];

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.id !== undefined && pendingCalls.has(data.id)) {
                const { resolve, reject, timeoutId } = pendingCalls.get(data.id);
                clearTimeout(timeoutId);
                pendingCalls.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
            if (data.method === 'Runtime.executionContextCreated') contexts.push(data.params.context);
            else if (data.method === 'Runtime.executionContextDestroyed') {
                const idx = contexts.findIndex(c => c.id === data.params.executionContextId);
                if (idx !== -1) contexts.splice(idx, 1);
            } else if (data.method === 'Runtime.executionContextsCleared') contexts.length = 0;
        } catch (e) { }
    });

    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;
        const timeoutId = setTimeout(() => {
            if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                reject(new Error(`CDP call ${method} timed out`));
            }
        }, 30000);
        pendingCalls.set(id, { resolve, reject, timeoutId });
        ws.send(JSON.stringify({ id, method, params }));
    });

    await call("Runtime.enable", {});
    
    const contextsProxy = new Proxy(contexts, {
        get(target, prop) {
            if (prop === Symbol.iterator) {
                return function* () {
                    if (target.length === 0) yield { id: undefined };
                    else yield* target;
                };
            }
            return target[prop];
        }
    });

    return { ws, call, contexts: contextsProxy };
}

// --- Initialization & Polling ---

async function initCDP() {
    console.log('🔍 Discovering Antigravity CDP endpoints...');
    const targets = await discoverCDP();
    
    if (targets.workbench && !cdpConnections.workbench) {
        cdpConnections.workbench = await connectCDP(targets.workbench.url);
        console.log(`✅ Connected to Workbench on port ${targets.workbench.port}`);
    }

    if (cdpConnections.workbench && !targets.manager && !cdpConnections.manager) {
        const launched = await workbenchCdp.autoOpenManager(cdpConnections.workbench);
        if (launched) {
            console.log('⏳ Waiting for Agent Manager to start...');
            await new Promise(r => setTimeout(r, 2000));
            const newTargets = await discoverCDP();
            if (newTargets.manager) targets.manager = newTargets.manager;
        }
    }
    
    if (targets.manager && !cdpConnections.manager) {
        cdpConnections.manager = await connectCDP(targets.manager.url);
        console.log(`✅ Connected to Agent Manager on port ${targets.manager.port}`);
        
        // Background initial capture
        setTimeout(async () => {
            const snap = await managerCdp.captureSnapshot(cdpConnections.manager, { fullScroll: false });
            if (snap && !snap.error) {
                lastSnapshot.data = snap;
                lastSnapshotHash = hashString(JSON.stringify(snap.messages) + (snap.isStreaming ? '1' : '0'));
            }
        }, 1000);
    }
}

async function startPolling(wss) {
    const poll = async () => {
        const wbDead = !cdpConnections.workbench || cdpConnections.workbench.ws.readyState !== WebSocket.OPEN;
        const mgDead = !cdpConnections.manager || cdpConnections.manager.ws.readyState !== WebSocket.OPEN;

        if (wbDead || mgDead) {
            if (wbDead) cdpConnections.workbench = null;
            if (mgDead) cdpConnections.manager = null;
            try { await initCDP(); } catch (e) {}
            if (!cdpConnections.workbench) { setTimeout(poll, 2000); return; }
        }

        if (cdpConnections.manager) {
            try {
                console.log('📸 Attempting to capture snapshot from Manager...');
                const snapshot = await managerCdp.captureSnapshot(cdpConnections.manager, { fullScroll: false });
                
                if (snapshot && !snapshot.error) {
                    if (!snapshot.messages) {
                        console.error('CRITICAL: snapshot has no error but messages is undefined!', JSON.stringify(snapshot).substring(0, 500));
                    }
                    
                    // Update cached agent message: keep the longest agent msg > 300 chars
                    const agentMsgs = (snapshot.messages || []).filter(m => m.role === 'agent' && m.content?.length > 300);
                    if (agentMsgs.length > 0) {
                        const best = agentMsgs.sort((a, b) => b.content.length - a.content.length)[0];
                        if (!cachedAgentMsg || best.content !== cachedAgentMsg.content) {
                            cachedAgentMsg = best;
                            console.log(`💾 Cached agent message (${best.content.length} chars)`);
                        }
                    }
                    
                    // Inject cached agent message into snapshot if not already present
                    if (cachedAgentMsg) {
                        const hasCached = snapshot.messages.some(m => m.content === cachedAgentMsg.content);
                        if (!hasCached) {
                            snapshot.messages.push(cachedAgentMsg);
                        }
                    }
                    
                    lastSnapshot.data = snapshot;
                    
                    const hash = hashString(JSON.stringify(lastSnapshot.data.messages) + (lastSnapshot.data.isStreaming ? '1' : '0'));
                    if (hash !== lastSnapshotHash) {
                        lastSnapshotHash = hash;
                        wss.broadcastUpdate?.(hash);
                        console.log(`📸 Snapshot updated(hash: ${hash})`);
                    }
                } else {
                    console.warn('⚠️ Snapshot capture returned error or null:', snapshot?.error || 'null');
                }
            } catch (e) {
                console.error('❌ Poll error:', e.message);
            }
        }
        setTimeout(poll, POLL_INTERVAL);
    };
    poll();
}

// --- Server Setup ---

async function createServer() {
    const app = express();
    const certDir = join(__dirname, 'certs');
    const hasSSL = fs.existsSync(join(certDir, 'server.key')) && fs.existsSync(join(certDir, 'server.cert'));

    const server = hasSSL 
        ? https.createServer({ key: fs.readFileSync(join(certDir, 'server.key')), cert: fs.readFileSync(join(certDir, 'server.cert')) }, app)
        : http.createServer(app);

    const wss = new WebSocketServer({ server });
    AUTH_TOKEN = hashString(APP_PASSWORD + (process.env.AUTH_SALT || 'antigravity_default_salt_99'));

    app.use(compression());
    app.use(express.json());
    app.use(cookieParser(process.env.SESSION_SECRET || 'antigravity_secret_key_1337'));

    // Middleware
    app.use((req, res, next) => {
        res.setHeader('ngrok-skip-browser-warning', 'true');
        next();
    });

    app.use((req, res, next) => {
        const publicPaths = ['/login', '/login.html', '/favicon.ico'];
        if (publicPaths.includes(req.path) || req.path.startsWith('/css/')) return next();
        if (isLocalRequest(req)) return next();
        
        if (req.query.key === APP_PASSWORD) {
            res.cookie(AUTH_COOKIE_NAME, AUTH_TOKEN, { httpOnly: true, signed: true, maxAge: 30*24*60*60*1000 });
            return res.redirect('/');
        }
        if (req.signedCookies[AUTH_COOKIE_NAME] === AUTH_TOKEN) return next();
        
        if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/snapshot')) {
            res.status(401).json({ error: 'Unauthorized' });
        } else {
            res.redirect('/login.html');
        }
    });

    app.use(express.static(join(__dirname, 'public')));

    // Setup Modules
    const wsHandler = setupWebSocket(wss, {
        AUTH_COOKIE_NAME,
        AUTH_TOKEN,
        SESSION_SECRET: process.env.SESSION_SECRET || 'antigravity_secret_key_1337',
        isLocalRequest
    });
    wss.broadcastUpdate = wsHandler.broadcastUpdate;

    setupRoutes(app, {
        cdpConnections,
        lastSnapshot,
        APP_PASSWORD,
        AUTH_COOKIE_NAME,
        AUTH_TOKEN,
        workbenchCdp,
        managerCdp,
        inspectUI,
        __dirname
    });

    return { server, wss, hasSSL };
}

// --- Main ---

async function main() {
    try { await initCDP(); } catch (e) {
        console.warn(`⚠️  Initial CDP discovery failed: ${e.message}`);
    }

    try {
        const { server, wss, hasSSL } = await createServer();
        startPolling(wss);

        const killPortProcess = async (port) => {
            try {
                if (process.platform === 'win32') {
                    const res = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: 'pipe' });
                    res.split('\n').forEach(line => {
                        const pid = line.trim().split(/\s+/).pop();
                        if (pid && pid !== '0') execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
                    });
                } else {
                    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
                }
            } catch (e) {}
        };

        await killPortProcess(SERVER_PORT);

        const getLocalIP = () => {
            const nets = os.networkInterfaces();
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    if (net.family === 'IPv4' && !net.internal) return net.address;
                }
            }
            return 'localhost';
        };

        server.listen(SERVER_PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on ${hasSSL ? 'https' : 'http'}://${getLocalIP()}:${SERVER_PORT}`);
        });

        const shutdown = () => {
            console.log('\n🛑 Shutting down...');
            wss.close();
            server.close();
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

main();
