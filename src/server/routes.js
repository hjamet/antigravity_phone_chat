import express from 'express';
import fs from 'fs';
import { join } from 'path';

/**
 * Setup Express routes for the application
 * @param {express.Application} app 
 * @param {Object} context App variables and CDP connections
 */
export function setupRoutes(app, { 
    cdpConnections, 
    lastSnapshot, 
    APP_PASSWORD, 
    AUTH_COOKIE_NAME, 
    AUTH_TOKEN, 
    workbenchCdp, 
    managerCdp, 
    inspectUI,
    __dirname 
}) {
    const router = express.Router();

    // Health check endpoint
    router.get('/health', (req, res) => {
        const hasSSL = fs.existsSync(join(__dirname, 'certs', 'server.key')) && fs.existsSync(join(__dirname, 'certs', 'server.cert'));
        res.json({
            status: 'ok',
            cdpConnected: cdpConnections.manager?.ws?.readyState === 1,
            workbenchConnected: cdpConnections.workbench?.ws?.readyState === 1,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            https: hasSSL
        });
    });

    // Login endpoint
    router.post('/login', (req, res) => {
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
    router.post('/logout', (req, res) => {
        res.clearCookie(AUTH_COOKIE_NAME);
        res.json({ success: true });
    });

    // Get current snapshot
    router.get('/snapshot', (req, res) => {
        if (!lastSnapshot.data) {
            return res.status(503).json({ error: 'No snapshot available yet' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(lastSnapshot.data);
    });

    // SSL status endpoint
    router.get('/ssl-status', (req, res) => {
        const keyPath = join(__dirname, 'certs', 'server.key');
        const certPath = join(__dirname, 'certs', 'server.cert');
        const certsExist = fs.existsSync(keyPath) && fs.existsSync(certPath);
        const hasSSL = certsExist; // Simplified for the route
        res.json({
            enabled: hasSSL,
            certsExist: certsExist,
            message: hasSSL ? 'HTTPS is active' :
                certsExist ? 'Certificates exist, restart server to enable HTTPS' :
                    'No certificates found'
        });
    });

    // Generate SSL certificates endpoint
    router.post('/generate-ssl', async (req, res) => {
        try {
            const { execSync } = await import('child_process');
            execSync('node scripts/generate_ssl.js', { cwd: __dirname, stdio: 'pipe' });
            res.json({
                success: true,
                message: 'SSL certificates generated! Restart the server to enable HTTPS.'
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Debug UI Endpoint
    router.get('/debug-ui', async (req, res) => {
        if (!cdpConnections.workbench) return res.status(503).json({ error: 'CDP not connected' });
        const uiTree = await inspectUI(cdpConnections.workbench);
        res.type('json').send(uiTree);
    });

    // CDP Interaction Routes
    router.post('/set-mode', async (req, res) => {
        const { mode } = req.body;
        const result = await managerCdp.setMode(cdpConnections.manager, mode);
        res.json(result);
    });

    router.post('/set-model', async (req, res) => {
        const { model } = req.body;
        const result = await managerCdp.setModel(cdpConnections.manager, model);
        res.json(result);
    });

    router.post('/stop', async (req, res) => {
        const result = await managerCdp.stopGeneration(cdpConnections.manager);
        res.json(result);
    });

    router.post('/send', async (req, res) => {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });
        const result = await managerCdp.injectMessage(cdpConnections.manager, message);
        res.json({
            success: result.ok !== false,
            method: result.method || 'attempted',
            details: result
        });
    });

    router.post('/remote-click', async (req, res) => {
        const { selector, index, textContent } = req.body;
        const result = await managerCdp.clickElement(cdpConnections.manager, { selector, index, textContent });
        res.json(result);
    });

    router.post('/remote-scroll', async (req, res) => {
        const { scrollTop, scrollPercent } = req.body;
        const result = await managerCdp.remoteScroll(cdpConnections.manager, scrollTop, scrollPercent);
        res.json(result);
    });

    router.get('/app-state', async (req, res) => {
        const result = await managerCdp.getAppState(cdpConnections.manager);
        res.json(result || { mode: 'Unknown', model: 'Unknown' });
    });

    router.post('/new-chat', async (req, res) => {
        const result = await managerCdp.startNewChat(cdpConnections.manager);
        res.json(result);
    });

    router.get('/chat-history', async (req, res) => {
        const result = await managerCdp.getChatHistory(cdpConnections.manager);
        res.json(result);
    });

    router.post('/select-chat', async (req, res) => {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Chat title required' });
        const result = await managerCdp.selectChat(cdpConnections.manager, title);
        res.json(result);
    });

    router.post('/close-history', async (req, res) => {
        const result = await workbenchCdp.closeHistory(cdpConnections.workbench);
        res.json(result);
    });

    router.get('/chat-status', async (req, res) => {
        const result = await managerCdp.hasChatOpen(cdpConnections.manager);
        res.json(result || { hasChat: false, hasMessages: false, editorFound: false });
    });

    // Project Management
    router.get('/api/projects', async (req, res) => {
        const result = await managerCdp.listProjects(cdpConnections.manager);
        res.json(result);
    });

    router.post('/api/projects/open', async (req, res) => {
        const { index, name } = req.body;
        const result = await managerCdp.openProject(cdpConnections.manager, { index, name });
        if (result) {
            res.json({ success: true, message: 'Opening project...' });
        } else {
            res.status(404).json({ error: 'Project not found' });
        }
    });

    router.post('/api/workspace/open', async (req, res) => {
        const result = await workbenchCdp.openWorkspaceDialog(cdpConnections.workbench);
        if (result.success) {
            return res.json({ success: true, message: 'Open Folder dialog opened on your computer.' });
        }
        res.status(500).json(result);
    });

    // Use router
    app.use('/', router);
}
