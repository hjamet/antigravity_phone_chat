import express from 'express';
import fs from 'fs';
import { join } from 'path';
import * as googleTTS from 'google-tts-api';

/**
 * Setup Express routes for the application
 * @param {express.Application} app 
 * @param {Object} context App variables and CDP connections
 */
export function setupRoutes(app, { 
    cdpConnections, 
    chatHistoryService, 
    APP_PASSWORD, 
    AUTH_COOKIE_NAME, 
    AUTH_TOKEN, 
    workbenchCdp, 
    managerCdp, 
    inspectUI,
    debugManagerDom,
    selectorErrorState,
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
        const snapshot = chatHistoryService.getSnapshot();
        if (!snapshot || !snapshot.messages || snapshot.messages.length === 0) {
            return res.status(503).json({ error: 'No snapshot available yet' });
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(snapshot);
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

    let lastSentMessage = null;
    let lastSentTime = 0;

    router.post('/send', async (req, res) => {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });
        
        // Anti-spam debounce (2 seconds)
        if (message === lastSentMessage && Date.now() - lastSentTime < 2000) {
            console.log(`[Debounce] Ignored duplicate message: "${message.substring(0, 30)}..."`);
            return res.json({ success: true, method: 'debounced', details: {} });
        }
        lastSentMessage = message;
        lastSentTime = Date.now();

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

    router.get('/app-state', async (req, res) => {
        const result = await managerCdp.getAppState(cdpConnections.manager);
        res.json(result || { mode: 'Unknown', model: 'Unknown' });
    });

    router.get('/available-models', async (req, res) => {
        const models = await managerCdp.getAvailableModels(cdpConnections.manager);
        res.json({ models });
    });

    router.get('/force-snapshot', async (req, res) => {
        try {
            const snapshot = await managerCdp.captureSnapshot(cdpConnections.manager, { fullScroll: false });
            if (snapshot && !snapshot.error) {
                const processed = chatHistoryService.processSnapshot(snapshot);
                return res.json(processed.snapshot);
            }
            return res.status(503).json({ error: snapshot?.error || 'Snapshot failed' });
        } catch(e) {
            return res.status(500).json({ error: e.message });
        }
    });

    router.get('/debug-dom', async (req, res) => {
        try {
            const result = await debugManagerDom(cdpConnections.manager);
            res.json(result);
        } catch (e) {
            res.status(503).json({ error: e.message });
        }
    });

    // --- Selector Error Diagnostics ---

    router.get('/api/selector-errors/dom', (req, res) => {
        const dumpPath = join(process.cwd(), 'debug', 'crash_dom.html');
        if (fs.existsSync(dumpPath)) {
            res.sendFile(dumpPath);
        } else {
            res.status(404).json({ error: 'No DOM dump found' });
        }
    });

    router.post('/api/selector-errors/reset', (req, res) => {
        console.log('🔄 Selector error reset requested. Resuming polling.');
        if (selectorErrorState) {
            selectorErrorState.active = false;
            selectorErrorState.report = null;
        }
        res.json({ success: true });
    });

    router.post('/api/tts', async (req, res) => {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text required' });

        try {
            // Remove markdown before generating TTS
            const cleanText = text
                .replace(/```[\s\S]*?```/g, 'Bloc de code.')
                .replace(/`([^`]+)`/g, '$1')
                .replace(/[#*_-]/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\]\]/g, '')
                .replace(/\[\[/g, '');

            const urls = googleTTS.getAllAudioUrls(cleanText || "Terminé.", {
                lang: 'fr',
                slow: false,
                host: 'https://translate.google.com',
                splitPunct: ',.?!'
            });
            res.json({ urls: urls.map(u => u.url) });
        } catch (e) {
            console.error('TTS Audio Generation Error:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ... End of route list ...

    router.post('/new-chat', async (req, res) => {
        // Use the same mechanism as /api/projects/open — this is proven to work.
        // 1. Get current workspace name from app state
        const state = await managerCdp.getAppState(cdpConnections.manager);
        const workspace = state?.workspace;
        if (!workspace) {
            return res.json({ error: 'Cannot determine current workspace. Open a project first.' });
        }
        // 2. Reset the server-side chat history cache (will intelligently block stale DOM)
        chatHistoryService.reset();
        // 3. Open the project (same as select-project) — this creates a new conversation
        const result = await managerCdp.openProject(cdpConnections.manager, { name: workspace });
        if (result) {
            res.json({ success: true, method: 'open_project', workspace });
        } else {
            res.json({ error: 'Failed to open project for new chat' });
        }
    });

    router.get('/chat-history', async (req, res) => {
        const result = await managerCdp.getChatHistory(cdpConnections.manager);
        res.json(result);
    });

    router.post('/select-chat', async (req, res) => {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'Chat title required' });
        chatHistoryService.reset();
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

    // Auto-verification endpoint for the agent
    router.post('/api/verify-extraction', (req, res) => {
        const { expectedTitle, expectedSummary } = req.body;
        
        if (!expectedSummary) {
            return res.status(400).json({ error: 'expectedSummary is required' });
        }

        const snapshot = chatHistoryService.getSnapshot();
        const messages = snapshot?.messages || [];

        // Find the last taskBlock
        const lastTaskBlock = [...messages].reverse().find(m => m.type === 'taskBlock');

        if (!lastTaskBlock) {
            return res.status(404).json({ success: false, error: 'No taskBlock found in recent history' });
        }

        const titleMatch = !expectedTitle || (lastTaskBlock.taskTitle || '').includes(expectedTitle.substring(0, 20)) || (expectedTitle || '').includes((lastTaskBlock.taskTitle || '').substring(0, 20));
            
        const expectedPrefix = expectedSummary.substring(0, 40).trim();
        const actualSummary = lastTaskBlock.taskSummary || '';
        const summaryMatch = actualSummary.includes(expectedPrefix) || expectedPrefix.includes(actualSummary.substring(0, 40));

        if (titleMatch && summaryMatch) {
            return res.json({ success: true, message: 'Extraction verified successfully' });
        } else {
            return res.status(409).json({ 
                success: false, 
                error: 'Extraction mismatch', 
                expected: { title: expectedTitle, summary: expectedPrefix },
                actual: { title: lastTaskBlock.taskTitle, summary: actualSummary.substring(0, 50) }
            });
        }
    });

    // --- Simple Controller Accessor Routes ---

    router.get('/api/last-title', (req, res) => {
        res.json({ title: chatHistoryService.getLastTitle() });
    });

    router.get('/api/last-paragraph', (req, res) => {
        res.json({ paragraph: chatHistoryService.getLastParagraph() });
    });

    router.get('/api/last-status', (req, res) => {
        res.json({ status: chatHistoryService.getLastStatus() });
    });

    router.get('/api/last-subtitles', (req, res) => {
        res.json({ subtitles: chatHistoryService.getLastSubtitles() });
    });

    router.get('/api/last-user-message', (req, res) => {
        res.json({ message: chatHistoryService.getLastUserMessage() });
    });

    router.get('/api/last-agent-message', (req, res) => {
        res.json({ message: chatHistoryService.getLastAgentMessage() });
    });

    // --- High-Level Controller Endpoint (polled every second by frontend) ---

    router.get('/api/chat-state', (req, res) => {
        res.json(chatHistoryService.getChatState());
    });

    // --- Picker (Workflow & Mention) ---

    router.post('/api/picker/trigger', async (req, res) => {
        const { char } = req.body;
        if (char !== '/' && char !== '@') return res.status(400).json({ error: 'char must be "/" or "@"' });
        const result = await managerCdp.triggerPicker(cdpConnections.manager, char);
        console.log("TRIGGER PICKER RESULT:", JSON.stringify(result).substring(0, 500));
        res.json(result);
    });

    router.post('/api/picker/select', async (req, res) => {
        const { index } = req.body;
        if (index === undefined) return res.status(400).json({ error: 'index required' });
        const result = await managerCdp.selectPickerOption(cdpConnections.manager, index);
        res.json(result);
    });

    router.post('/api/picker/typeahead-select', async (req, res) => {
        const { index } = req.body;
        if (index === undefined) return res.status(400).json({ error: 'index required' });
        const result = await managerCdp.selectTypeaheadItem(cdpConnections.manager, index);
        res.json(result);
    });

    router.post('/api/picker/select-workflow', async (req, res) => {
        const { index } = req.body;
        if (index === undefined) return res.status(400).json({ error: 'index required' });
        const result = await managerCdp.selectWorkflowItem(cdpConnections.manager, index);
        res.json(result);
    });

    // --- Screenshot ---

    router.get('/api/screenshot', async (req, res) => {
        if (!cdpConnections.manager) return res.status(503).json({ error: 'Agent Manager not connected' });
        try {
            const result = await cdpConnections.manager.call('Page.captureScreenshot', { format: 'png' });
            if (result && result.data) {
                res.json({ data: `data:image/png;base64,${result.data}` });
            } else {
                res.status(500).json({ error: 'Screenshot capture returned no data' });
            }
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- Artifacts ---

    router.get('/api/artifacts', async (req, res) => {
        const result = await managerCdp.listArtifacts(cdpConnections.manager);
        res.json(result);
    });

    router.get('/api/artifacts/:name', async (req, res) => {
        const { name } = req.params;
        if (!name) return res.status(400).json({ error: 'Artifact name required' });
        const result = await managerCdp.getArtifactContent(cdpConnections.manager, decodeURIComponent(name));
        res.json(result);
    });

    router.post('/api/artifacts/:name/comment', async (req, res) => {
        const { name } = req.params;
        const { selectedText, comment } = req.body;
        if (!name || !comment || !selectedText) {
            return res.status(400).json({ error: 'name, selectedText and comment required' });
        }
        const result = await managerCdp.addContextualComment(cdpConnections.manager, {
            artifactName: decodeURIComponent(name),
            selectedText,
            comment
        });
        res.json(result);
    });

    router.post('/api/artifacts/proceed', async (req, res) => {
        const result = await managerCdp.proceedArtifact(cdpConnections.manager);
        res.json(result);
    });

    // Use router
    app.use('/', router);
}
