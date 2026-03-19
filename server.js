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
import { inspectUI } from './ui_inspector.js';
import { execSync } from 'child_process';

// Modular CDP Scripts
import * as workbenchCdp from './src/cdp/workbench.js';
import * as managerCdp from './src/cdp/manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORTS = [9000, 9001, 9002, 9003];
const POLL_INTERVAL = 1000; // 1 second
const SERVER_PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'antigravity';
const AUTH_COOKIE_NAME = 'ag_auth_token';
// Note: hashString is defined later, so we'll initialize the token inside createServer or use a simple string for now.
let AUTH_TOKEN = 'ag_default_token';


// Shared CDP connections
const cdpConnections = {
    workbench: null,
    manager: null
};
let lastSnapshot = null;
let lastSnapshotHash = null;

// Kill any existing process on the server port (prevents EADDRINUSE)
function killPortProcess(port) {
    try {
        if (process.platform === 'win32') {
            // Windows: Find PID using netstat and kill it
            const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const lines = result.trim().split('\n');
            const pids = new Set();
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && pid !== '0') pids.add(pid);
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' });
                    console.log(`⚠️  Killed existing process on port ${port} (PID: ${pid})`);
                } catch (e) { /* Process may have already exited */ }
            }
        } else {
            // Linux/macOS: Use lsof and kill
            const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            const pids = result.trim().split('\n').filter(p => p);
            for (const pid of pids) {
                try {
                    execSync(`kill -9 ${pid}`, { stdio: 'pipe' });
                    console.log(`⚠️  Killed existing process on port ${port} (PID: ${pid})`);
                } catch (e) { /* Process may have already exited */ }
            }
        }
        // Small delay to let the port be released
        return new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
        // No process found on port - this is fine
        return Promise.resolve();
    }
}

// Get local IP address for mobile access
// Prefers real network IPs (192.168.x.x, 10.x.x.x) over virtual adapters (172.x.x.x from WSL/Docker)
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push({
                    address: iface.address,
                    name: name,
                    // Prioritize common home/office network ranges
                    priority: iface.address.startsWith('192.168.') ? 1 :
                        iface.address.startsWith('10.') ? 2 :
                            iface.address.startsWith('172.') ? 3 : 4
                });
            }
        }
    }

    // Sort by priority and return the best one
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.length > 0 ? candidates[0].address : 'localhost';
}

// Helper: HTTP GET JSON
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

// Find Antigravity CDP endpoints
async function discoverCDP() {
    const errors = [];
    const targets = { workbench: null, manager: null };
    
    for (const port of PORTS) {
        try {
            const list = await getJson(`http://127.0.0.1:${port}/json/list`);

            // Find Workbench (The main window)
            const workbench = list.find(t => t.url?.includes('workbench.html') || (t.title && t.title.includes('workbench')));
            if (workbench && workbench.webSocketDebuggerUrl && !targets.workbench) {
                console.log('Found Workbench target:', workbench.title, `on port ${port}`);
                targets.workbench = { port, url: workbench.webSocketDebuggerUrl };
            }

            // Find Agent Manager
            // Prioritize target titled "Manager" as it contains the full history and workspaces
            const manager = list.find(t => t.title === 'Manager');
            const jetski = list.find(t => t.url?.includes('jetski') || t.title === 'Launchpad' || t.title?.includes('Agent Manager'));
            const target = manager || jetski;

            if (target && target.webSocketDebuggerUrl && !targets.manager) {
                console.log('Found Agent Manager target:', target.title, `on port ${port}`);
                targets.manager = { port, url: target.webSocketDebuggerUrl };
            }
            
            if (targets.workbench && targets.manager) break; // Found both
            
        } catch (e) {
            errors.push(`${port}: ${e.message}`);
        }
    }
    
    if (!targets.workbench && !targets.manager) {
        const errorSummary = errors.length ? `Errors: ${errors.join(', ')}` : 'No ports responding';
        throw new Error(`CDP not found. ${errorSummary}`);
    }
    
    return targets;
}

// Connect to CDP
async function connectCDP(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    let idCounter = 1;
    const pendingCalls = new Map(); // Track pending calls by ID
    const contexts = [];
    const CDP_CALL_TIMEOUT = 30000; // 30 seconds timeout

    // Single centralized message handler (fixes MaxListenersExceeded warning)
    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);

            // Handle CDP method responses
            if (data.id !== undefined && pendingCalls.has(data.id)) {
                const { resolve, reject, timeoutId } = pendingCalls.get(data.id);
                clearTimeout(timeoutId);
                pendingCalls.delete(data.id);

                if (data.error) reject(data.error);
                else resolve(data.result);
            }

            // Handle execution context events
            if (data.method === 'Runtime.executionContextCreated') {
                contexts.push(data.params.context);
            } else if (data.method === 'Runtime.executionContextDestroyed') {
                const id = data.params.executionContextId;
                const idx = contexts.findIndex(c => c.id === id);
                if (idx !== -1) contexts.splice(idx, 1);
            } else if (data.method === 'Runtime.executionContextsCleared') {
                contexts.length = 0;
            }
        } catch (e) { }
    });

    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;

        // Setup timeout to prevent memory leaks from never-resolved calls
        const timeoutId = setTimeout(() => {
            if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                reject(new Error(`CDP call ${method} timed out after ${CDP_CALL_TIMEOUT}ms`));
            }
        }, CDP_CALL_TIMEOUT);

        pendingCalls.set(id, { resolve, reject, timeoutId });
        ws.send(JSON.stringify({ id, method, params }));
    });

    await call("Runtime.enable", {});
    await new Promise(r => setTimeout(r, 1000));

    return { ws, call, contexts };
}

// --- CDP Functions (Delegated to src/cdp/ modules) ---

async function captureSnapshot(cdp) {
    return await workbenchCdp.captureSnapshot(cdp);
}

async function injectMessage(text) {
    return await workbenchCdp.injectMessage(cdpConnections.workbench, text);
}

async function stopGeneration() {
    return await workbenchCdp.stopGeneration(cdpConnections.workbench);
}

async function clickElement(params) {
    return await workbenchCdp.clickElement(cdpConnections.workbench, params);
}

async function remoteScroll(scrollTop, scrollPercent) {
    return await workbenchCdp.remoteScroll(cdpConnections.workbench, scrollTop, scrollPercent);
}

async function setMode(modeText) {
    return await workbenchCdp.setMode(cdpConnections.workbench, modeText);
}

async function setModel(modelText) {
    return await workbenchCdp.setModel(cdpConnections.workbench, modelText);
}

async function startNewChat() {
    return await workbenchCdp.startNewChat(cdpConnections.workbench);
}

async function getChatHistoryFromManager() {
    return await managerCdp.getChatHistory(cdpConnections.manager);
}

async function selectChat(chatTitle) {
    return await managerCdp.selectChat(cdpConnections.workbench, chatTitle);
}

async function closeHistory() {
    return await workbenchCdp.closeHistory(cdpConnections.workbench);
}

async function hasChatOpen() {
    return await workbenchCdp.hasChatOpen(cdpConnections.workbench);
}

async function getAppState() {
    return await workbenchCdp.getAppState(cdpConnections.workbench);
}

async function autoOpenManager(workbenchCdp) {
    return await workbenchCdp.autoOpenManager(workbenchCdp);
}
// Initialize CDP connections
async function initCDP() {
    console.log('🔍 Discovering Antigravity CDP endpoints...');
    const targets = await discoverCDP();
    
    if (targets.workbench && !cdpConnections.workbench) {
        console.log(`✅ Found Workbench on port ${targets.workbench.port}`);
        console.log('🔌 Connecting to Workbench...');
        cdpConnections.workbench = await connectCDP(targets.workbench.url);
        console.log(`✅ Connected to Workbench! (${cdpConnections.workbench.contexts.length} contexts)`);
    }

    // Auto-launch Launchpad if Workbench is connected but Launchpad is not found yet
    if (cdpConnections.workbench && !targets.manager && !cdpConnections.manager) {
        const launched = await autoOpenLaunchpad(cdpConnections.workbench);
        if (launched) {
            console.log('⏳ Waiting for Launchpad to start...');
            await new Promise(r => setTimeout(r, 2000)); // Give it time to render
            
            // Re-discover targets
            const newTargets = await discoverCDP();
            if (newTargets.manager) {
                targets.manager = newTargets.manager;
            }
        } else {
            console.log('⚠️ Could not automatically launch Agent Manager. Please open it manually if you need multi-workspace support.');
        }
    }
    
    if (targets.manager && !cdpConnections.manager) {
        console.log(`✅ Found Launchpad on port ${targets.manager.port}`);
        console.log('🔌 Connecting to Launchpad...');
        cdpConnections.manager = await connectCDP(targets.manager.url);
        console.log(`✅ Connected to Launchpad! (${cdpConnections.manager.contexts.length} contexts)`);
    }
}

// Background polling
async function startPolling(wss) {
    let lastErrorLog = 0;
    let isConnecting = false;

    const poll = async () => {
        const isWorkbenchDead = !cdpConnections.workbench || (cdpConnections.workbench.ws && cdpConnections.workbench.ws.readyState !== WebSocket.OPEN);
        const isLaunchpadDead = !cdpConnections.manager || (cdpConnections.manager.ws && cdpConnections.manager.ws.readyState !== WebSocket.OPEN);

        if (isWorkbenchDead || isLaunchpadDead) {
            if (!isConnecting) {
                console.log('🔍 Looking for missing Antigravity CDP connections...');
                isConnecting = true;
            }
            
            if (isWorkbenchDead && cdpConnections.workbench) {
                console.log('🔄 Workbench connection lost. Attempting to reconnect...');
                cdpConnections.workbench = null;
            }
            if (isLaunchpadDead && cdpConnections.manager) {
                console.log('🔄 Launchpad connection lost. Attempting to reconnect...');
                cdpConnections.manager = null;
            }
            
            try {
                await initCDP();
                if (cdpConnections.workbench && cdpConnections.manager) {
                    console.log('✅ All CDP connections established');
                    isConnecting = false;
                } else if (cdpConnections.workbench) {
                    // We only need the workbench to function primarily, manager is a bonus
                    isConnecting = false; 
                }
            } catch (err) {
                // Not found yet, just wait for next cycle
            }
            
            // Only retry quickly if we lost workbench. If we just lost manager, poll normally
            if (!cdpConnections.workbench) {
                setTimeout(poll, 2000);
                return;
            }
        }

        // Fast path: Take snapshot of Workbench
        if (cdpConnections.workbench) {
            try {
                const snapshot = await captureSnapshot(cdpConnections.workbench);
                if (snapshot && !snapshot.error) {
                    const hash = hashString(snapshot.html);

                    if (hash !== lastSnapshotHash) {
                        lastSnapshot = snapshot;
                        lastSnapshotHash = hash;

                        // Broadcast to all connected clients
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'snapshot_update',
                                    timestamp: new Date().toISOString()
                                }));
                            }
                        });

                        console.log(`📸 Snapshot updated(hash: ${hash})`);
                    }
                } else {
                    const now = Date.now();
                    if (!lastErrorLog || now - lastErrorLog > 10000) {
                        const errorMsg = snapshot?.error || 'No valid snapshot captured (check contexts)';
                        console.warn(`⚠️  Snapshot capture issue: ${errorMsg} `);
                        if (errorMsg.includes('container not found')) {
                            console.log('   (Tip: Ensure an active chat is open in Antigravity)');
                        }
                        if (cdpConnections.workbench.contexts.length === 0) {
                            console.log('   (Tip: No active execution contexts found. Try interacting with the Antigravity window)');
                        }
                        lastErrorLog = now;
                    }
                }
            } catch (err) {
                console.error('Poll error:', err.message);
            }
        }

        setTimeout(poll, POLL_INTERVAL);
    };

    poll();
}

// Create Express app
async function createServer() {
    const app = express();

    // Check for SSL certificates
    const keyPath = join(__dirname, 'certs', 'server.key');
    const certPath = join(__dirname, 'certs', 'server.cert');
    const hasSSL = fs.existsSync(keyPath) && fs.existsSync(certPath);

    let server;
    let httpsServer = null;

    if (hasSSL) {
        const sslOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
        httpsServer = https.createServer(sslOptions, app);
        server = httpsServer;
    } else {
        server = http.createServer(app);
    }

    const wss = new WebSocketServer({ server });

    // Initialize Auth Token using a unique salt from environment
    const authSalt = process.env.AUTH_SALT || 'antigravity_default_salt_99';
    AUTH_TOKEN = hashString(APP_PASSWORD + authSalt);

    app.use(compression());
    app.use(express.json());

    // Use a secure session secret from .env if available
    const sessionSecret = process.env.SESSION_SECRET || 'antigravity_secret_key_1337';
    app.use(cookieParser(sessionSecret));

    // Ngrok Bypass Middleware
    app.use((req, res, next) => {
        // Tell ngrok to skip the "visit" warning for API requests
        res.setHeader('ngrok-skip-browser-warning', 'true');
        next();
    });

    // Auth Middleware
    app.use((req, res, next) => {
        const publicPaths = ['/login', '/login.html', '/favicon.ico'];
        if (publicPaths.includes(req.path) || req.path.startsWith('/css/')) {
            return next();
        }

        // Exempt local Wi-Fi devices from authentication
        if (isLocalRequest(req)) {
            return next();
        }

        // Magic Link / QR Code Auto-Login
        if (req.query.key === APP_PASSWORD) {
            res.cookie(AUTH_COOKIE_NAME, AUTH_TOKEN, {
                httpOnly: true,
                signed: true,
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            // Remove the key from the URL by redirecting to the base path
            return res.redirect('/');
        }

        const token = req.signedCookies[AUTH_COOKIE_NAME];
        if (token === AUTH_TOKEN) {
            return next();
        }

        // If it's an API request, return 401, otherwise redirect to login
        if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/snapshot') || req.path.startsWith('/send')) {
            res.status(401).json({ error: 'Unauthorized' });
        } else {
            res.redirect('/login.html');
        }
    });

    app.use(express.static(join(__dirname, 'public')));

    // Login endpoint
    app.post('/login', (req, res) => {
        const { password } = req.body;
        if (password === APP_PASSWORD) {
            res.cookie(AUTH_COOKIE_NAME, AUTH_TOKEN, {
                httpOnly: true,
                signed: true,
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, error: 'Invalid password' });
        }
    });

    // Logout endpoint
    app.post('/logout', (req, res) => {
        res.clearCookie(AUTH_COOKIE_NAME);
        res.json({ success: true });
    });

    // Get current snapshot
    app.get('/snapshot', (req, res) => {
        if (!lastSnapshot) {
            return res.status(503).json({ error: 'No snapshot available yet' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(lastSnapshot);
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            cdpConnected: cdpConnections.workbench?.ws?.readyState === 1 || cdpConnections.manager?.ws?.readyState === 1,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            https: hasSSL
        });
    });

    // SSL status endpoint
    app.get('/ssl-status', (req, res) => {
        const keyPath = join(__dirname, 'certs', 'server.key');
        const certPath = join(__dirname, 'certs', 'server.cert');
        const certsExist = fs.existsSync(keyPath) && fs.existsSync(certPath);
        res.json({
            enabled: hasSSL,
            certsExist: certsExist,
            message: hasSSL ? 'HTTPS is active' :
                certsExist ? 'Certificates exist, restart server to enable HTTPS' :
                    'No certificates found'
        });
    });

    // Generate SSL certificates endpoint
    app.post('/generate-ssl', async (req, res) => {
        try {
            const { execSync } = await import('child_process');
            execSync('node generate_ssl.js', { cwd: __dirname, stdio: 'pipe' });
            res.json({
                success: true,
                message: 'SSL certificates generated! Restart the server to enable HTTPS.'
            });
        } catch (e) {
            res.status(500).json({
                success: false,
                error: e.message
            });
        }
    });

    // Debug UI Endpoint
    app.get('/debug-ui', async (req, res) => {
        if (!cdpConnections.workbench) return res.status(503).json({ error: 'CDP not connected' });
        const uiTree = await inspectUI(cdpConnections.workbench);
        console.log('--- UI TREE ---');
        console.log(uiTree);
        console.log('---------------');
        res.type('json').send(uiTree);
    });

    // Set Mode
    app.post('/set-mode', async (req, res) => {
        const { mode } = req.body;
        const result = await setMode(mode);
        res.json(result);
    });

    // Set Model
    app.post('/set-model', async (req, res) => {
        const { model } = req.body;
        const result = await setModel(model);
        res.json(result);
    });

    // Stop Generation
    app.post('/stop', async (req, res) => {
        const result = await stopGeneration();
        res.json(result);
    });

    // --- PROJECT MANAGEMENT ROUTES --- //

    // List recent projects from Agent Manager (Launchpad)
    app.get('/api/projects', async (req, res) => {
        if (!cdpConnections.manager) {
            return res.status(503).json({ error: 'Agent Manager not connected', projects: [] });
        }

        const EXP = `(async () => {
            try {
                const projects = [];
                // Find all project div containers
                const items = document.querySelectorAll('div.px-2\\\\.5.cursor-pointer');
                
                items.forEach((item, index) => {
                    // Extract name and path based on observed DOM structure
                    const nameSpan = item.querySelector('span.text-sm > span');
                    const pathSpan = item.querySelector('span.text-xs.opacity-50 > span');
                    
                    if (nameSpan) {
                        projects.push({
                            index: index,
                            name: nameSpan.innerText.trim(),
                            path: pathSpan ? pathSpan.innerText.trim() : ''
                        });
                    }
                });
                return { success: true, projects };
            } catch (err) {
                return { error: err.toString() };
            }
        })()`;

        try {
            // Launchpad usually has only 1 context, but we check all just in case
            for (const ctx of cdpConnections.manager.contexts) {
                const result = await cdpConnections.manager.call("Runtime.evaluate", {
                    expression: EXP,
                    returnByValue: true,
                    awaitPromise: true,
                    contextId: ctx.id
                });
                
                if (result.result?.value?.success) {
                    return res.json(result.result.value.projects);
                }
            }
            res.json([]); // Empty list if nothing found
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Open a specific project from Agent Manager
    app.post('/api/projects/open', async (req, res) => {
        const { index, name } = req.body;
        
        if (!cdpConnections.manager) {
            return res.status(503).json({ error: 'Agent Manager not connected' });
        }

        const EXP = `(async () => {
            try {
                const targetName = ${JSON.stringify(name || '')};
                const targetIndex = ${JSON.stringify(index !== undefined ? index : -1)};
                
                const items = document.querySelectorAll('div.px-2\\\\.5.cursor-pointer');
                
                let targetEl = null;
                
                // Prioritize index if provided and valid
                if (targetIndex >= 0 && targetIndex < items.length) {
                    targetEl = items[targetIndex];
                } 
                // Fallback to name search
                else if (targetName) {
                    for (const item of items) {
                        const nameSpan = item.querySelector('span.text-sm > span');
                        if (nameSpan && nameSpan.innerText.trim() === targetName) {
                            targetEl = item;
                            break;
                        }
                    }
                }
                
                if (targetEl) {
                    targetEl.click();
                    return { success: true };
                }
                
                return { error: 'Project not found' };
            } catch (err) {
                return { error: err.toString() };
            }
        })()`;

        try {
            for (const ctx of cdpConnections.manager.contexts) {
                const result = await cdpConnections.manager.call("Runtime.evaluate", {
                    expression: EXP,
                    returnByValue: true,
                    awaitPromise: true,
                    contextId: ctx.id
                });
                
                if (result.result?.value?.success) {
                    // Expect Workbench connection to break and restart
                    console.log('🔄 Project opened. Preparing for Workbench restart...');
                    // Don't nullify WB right away, polling will catch it, but let's notify client it's expected
                    return res.json({ success: true, message: 'Opening project...' });
                }
            }
            res.status(404).json({ error: 'Project not matching or Context failed' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Open arbitrary workspace dialog 
    app.post('/api/workspace/open', async (req, res) => {
        if (!cdpConnections.workbench) {
            return res.status(503).json({ error: 'Workbench not connected' });
        }

        // We use the command palette trick: Command+Shift+P -> "Open Workspace"
        const EXP = `(async () => {
            try {
                // Easiest is to dispatch keyboard shortcut (Ctrl+O / Cmd+O) to open folder
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                
                // Dispatch Ctrl+K then Ctrl+O (standard VSCode shortcut for Open Folder)
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'k',
                    code: 'KeyK',
                    ctrlKey: !isMac,
                    metaKey: isMac,
                    bubbles: true
                }));
                
                setTimeout(() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'o',
                        code: 'KeyO',
                        ctrlKey: !isMac,
                        metaKey: isMac,
                        bubbles: true
                    }));
                }, 50);

                return { success: true };
            } catch (err) {
                return { error: err.toString() };
            }
        })()`;

        try {
            for (const ctx of cdpConnections.workbench.contexts) {
                const result = await cdpConnections.workbench.call("Runtime.evaluate", {
                    expression: EXP,
                    returnByValue: true,
                    awaitPromise: true,
                    contextId: ctx.id
                });
                
                if (result.result?.value?.success) {
                    return res.json({ success: true, message: 'Open Folder dialog opened on your computer.' });
                }
            }
            res.status(500).json({ error: 'Failed to trigger Open Workspace' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Send message
    app.post('/send', async (req, res) => {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        const result = await injectMessage(message);

        // Always return 200 - the message usually goes through even if CDP reports issues
        // The client will refresh and see if the message appeared
        res.json({
            success: result.ok !== false,
            method: result.method || 'attempted',
            details: result
        });
    });

    // UI Inspection endpoint - Returns all buttons as JSON for debugging
    app.get('/ui-inspect', async (req, res) => {
        if (!cdpConnections.workbench) return res.status(503).json({ error: 'CDP disconnected' });

        const EXP = `(() => {
    try {
        // Safeguard for non-DOM contexts
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return { error: 'Non-DOM context' };
        }

        // Helper to get string class name safely (handles SVGAnimatedString)
        function getCls(el) {
            if (!el) return '';
            if (typeof el.className === 'string') return el.className;
            if (el.className && typeof el.className.baseVal === 'string') return el.className.baseVal;
            return '';
        }

        // Helper to pierce Shadow DOM
        function findAllElements(selector, root = document) {
            let results = Array.from(root.querySelectorAll(selector));
            const elements = root.querySelectorAll('*');
            for (const el of elements) {
                try {
                    if (el.shadowRoot) {
                        results = results.concat(Array.from(el.shadowRoot.querySelectorAll(selector)));
                    }
                } catch (e) { }
            }
            return results;
        }

        // Get standard info
        const url = window.location ? window.location.href : '';
        const title = document.title || '';
        const bodyLen = document.body ? document.body.innerHTML.length : 0;
        const hasCascade = !!document.getElementById('cascade') || !!document.querySelector('.cascade');

        // Scan for buttons
        const allLucideElements = findAllElements('svg[class*="lucide"]').map(svg => {
            const parent = svg.closest('button, [role="button"], div, span, a');
            if (!parent || parent.offsetParent === null) return null;
            const rect = parent.getBoundingClientRect();
            return {
                type: 'lucide-icon',
                tag: parent.tagName.toLowerCase(),
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                svgClasses: getCls(svg),
                className: getCls(parent).substring(0, 100),
                ariaLabel: parent.getAttribute('aria-label') || '',
                title: parent.getAttribute('title') || '',
                parentText: (parent.innerText || '').trim().substring(0, 50)
            };
        }).filter(Boolean);

        const buttons = findAllElements('button, [role="button"]').map((btn, i) => {
            const rect = btn.getBoundingClientRect();
            const svg = btn.querySelector('svg');

            return {
                type: 'button',
                index: i,
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                text: (btn.innerText || '').trim().substring(0, 50) || '(empty)',
                ariaLabel: btn.getAttribute('aria-label') || '',
                title: btn.getAttribute('title') || '',
                svgClasses: getCls(svg),
                className: getCls(btn).substring(0, 100),
                visible: btn.offsetParent !== null
            };
        }).filter(b => b.visible);

        return {
            url, title, bodyLen, hasCascade,
            buttons, lucideIcons: allLucideElements
        };
    } catch (err) {
        return { error: err.toString(), stack: err.stack };
    }
})()`;

        try {
            // 1. Get Frames
            const { frameTree } = await cdpConnections.workbench.call("Page.getFrameTree");
            function flattenFrames(node) {
                let list = [{
                    id: node.frame.id,
                    url: node.frame.url,
                    name: node.frame.name,
                    parentId: node.frame.parentId
                }];
                if (node.childFrames) {
                    for (const child of node.childFrames) list = list.concat(flattenFrames(child));
                }
                return list;
            }
            const allFrames = flattenFrames(frameTree);

            // 2. Map Contexts
            const contexts = cdpConnections.workbench.contexts.map(c => ({
                id: c.id,
                name: c.name,
                origin: c.origin,
                frameId: c.auxData ? c.auxData.frameId : null,
                isDefault: c.auxData ? c.auxData.isDefault : false
            }));

            // 3. Scan ALL Contexts
            const contextResults = [];
            for (const ctx of contexts) {
                try {
                    const result = await cdpConnections.workbench.call("Runtime.evaluate", {
                        expression: EXP,
                        returnByValue: true,
                        contextId: ctx.id
                    });

                    if (result.result?.value) {
                        const val = result.result.value;
                        contextResults.push({
                            contextId: ctx.id,
                            frameId: ctx.frameId,
                            url: val.url,
                            title: val.title,
                            hasCascade: val.hasCascade,
                            buttonCount: val.buttons.length,
                            lucideCount: val.lucideIcons.length,
                            buttons: val.buttons, // Store buttons for analysis
                            lucideIcons: val.lucideIcons
                        });
                    } else if (result.exceptionDetails) {
                        contextResults.push({
                            contextId: ctx.id,
                            frameId: ctx.frameId,
                            error: `Script Exception: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ''} `
                        });
                    } else {
                        contextResults.push({
                            contextId: ctx.id,
                            frameId: ctx.frameId,
                            error: 'No value returned (undefined)'
                        });
                    }
                } catch (e) {
                    contextResults.push({ contextId: ctx.id, error: e.message });
                }
            }

            // 4. Match and Analyze
            const cascadeFrame = allFrames.find(f => f.url.includes('cascade'));
            const matchingContext = contextResults.find(c => c.frameId === cascadeFrame?.id);
            const contentContext = contextResults.sort((a, b) => (b.buttonCount || 0) - (a.buttonCount || 0))[0];

            // Prepare "useful buttons" from the best context
            const bestContext = matchingContext || contentContext;
            const usefulButtons = bestContext ? (bestContext.buttons || []).filter(b =>
                b.ariaLabel?.includes('New Conversation') ||
                b.title?.includes('New Conversation') ||
                b.ariaLabel?.includes('Past Conversations') ||
                b.title?.includes('Past Conversations') ||
                b.ariaLabel?.includes('History')
            ) : [];

            res.json({
                summary: {
                    frameFound: !!cascadeFrame,
                    cascadeFrameId: cascadeFrame?.id,
                    contextFound: !!matchingContext,
                    bestContextId: bestContext?.contextId
                },
                frames: allFrames,
                contexts: contexts,
                scanResults: contextResults.map(c => ({
                    id: c.contextId,
                    frameId: c.frameId,
                    url: c.url,
                    hasCascade: c.hasCascade,
                    buttons: c.buttonCount,
                    error: c.error
                })),
                usefulButtons: usefulButtons,
                bestContextData: bestContext // Full data for the best context
            });

        } catch (e) {
            res.status(500).json({ error: e.message, stack: e.stack });
        }
    });

    // Endpoint to list all CDP targets - helpful for debugging connection issues
    app.get('/cdp-targets', async (req, res) => {
        const results = {};
        for (const port of PORTS) {
            try {
                const list = await getJson(`http://127.0.0.1:${port}/json/list`);
                results[port] = list;
            } catch (e) {
                results[port] = e.message;
            }
        }
        res.json(results);
    });

    // WebSocket connection with Auth check
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
            const sessionSecret = process.env.SESSION_SECRET || 'antigravity_secret_key_1337';
            const token = cookieParser.signedCookie(signedToken, sessionSecret);
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

    return { server, wss, app, hasSSL };
}

// Main
async function main() {
    try {
        await initCDP();
    } catch (err) {
        console.warn(`⚠️  Initial CDP discovery failed: ${err.message}`);
        console.log('💡 Start Antigravity with --remote-debugging-port=9000 to connect.');
    }

    try {
        const { server, wss, app, hasSSL } = await createServer();

        // Start background polling (it will now handle reconnections)
        startPolling(wss);

        // Remote Click
        app.post('/remote-click', async (req, res) => {
            const { selector, index, textContent } = req.body;
            const result = await clickElement({ selector, index, textContent });
            res.json(result);
        });

        // Remote Scroll - sync phone scroll to desktop
        app.post('/remote-scroll', async (req, res) => {
            const { scrollTop, scrollPercent } = req.body;
            const result = await remoteScroll(scrollTop, scrollPercent);
            res.json(result);
        });

        // Get App State
        app.get('/app-state', async (req, res) => {
            const result = await getAppState();
            res.json(result || { mode: 'Unknown', model: 'Unknown' });
        });

        // Start New Chat
        app.post('/new-chat', async (req, res) => {
            const result = await startNewChat();
            res.json(result);
        });

        // Get Chat History
        app.get('/chat-history', async (req, res) => {
            const result = await getChatHistoryFromManager();
            res.json(result);
        });

        // Select a Chat
        app.post('/select-chat', async (req, res) => {
            const { title } = req.body;
            if (!title) return res.status(400).json({ error: 'Chat title required' });
            const result = await selectChat(title);
            res.json(result);
        });

        // Close Chat History
        app.post('/close-history', async (req, res) => {
            const result = await closeHistory();
            res.json(result);
        });

        // Check if Chat is Open
        app.get('/chat-status', async (req, res) => {
            const result = await hasChatOpen();
            res.json(result || { hasChat: false, hasMessages: false, editorFound: false });
        });

        // Kill any existing process on the port before starting
        await killPortProcess(SERVER_PORT);

        // Start server
        const localIP = getLocalIP();
        const protocol = hasSSL ? 'https' : 'http';
        server.listen(SERVER_PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on ${protocol}://${localIP}:${SERVER_PORT}`);
            if (hasSSL) {
                console.log(`💡 First time on phone? Accept the security warning to proceed.`);
            }
        });

        // Graceful shutdown handlers
        const gracefulShutdown = (signal) => {
            console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
            wss.close(() => {
                console.log('   WebSocket server closed');
            });
            server.close(() => {
                console.log('   HTTP server closed');
            });
            if (cdpConnections.workbench?.ws) {
                cdpConnections.workbench.ws.close();
                console.log('   Workbench CDP connection closed');
            }
            if (cdpConnections.manager?.ws) {
                cdpConnections.manager.ws.close();
                console.log('   Launchpad CDP connection closed');
            }
            setTimeout(() => process.exit(0), 1000);
        };

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    } catch (err) {
        console.error('❌ Fatal error:', err.message);
        process.exit(1);
    }
}

main();
