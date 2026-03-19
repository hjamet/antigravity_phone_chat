import http from 'http';
import WebSocket from 'ws';
import * as manager from './src/cdp/manager.js';

const CDP_PORT = 9000;

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function connectCDP(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const pendingCalls = new Map();
    const contexts = [];

    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.id && pendingCalls.has(data.id)) {
                const { resolve, reject, timeoutId } = pendingCalls.get(data.id);
                clearTimeout(timeoutId);
                pendingCalls.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
            if (data.method === 'Runtime.executionContextCreated') contexts.push(data.params.context);
        } catch (e) {}
    });

    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;
        const timeoutId = setTimeout(() => reject('timeout'), 5000);
        pendingCalls.set(id, { resolve, reject, timeoutId });
        ws.send(JSON.stringify({ id, method, params }));
    });

    await call("Runtime.enable", {});
    
    // Wait for contexts to populate
    await new Promise(r => setTimeout(r, 1000));

    return { ws, call, contexts };
}

async function run() {
    try {
        const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json`);
        const managerTarget = targets.find(t => t.url && t.url.includes('workbench-jetski-agent.html') && t.type === 'page');
        
        if (!managerTarget) {
            console.log('Manager not found');
            return;
        }

        const cdp = await connectCDP(managerTarget.webSocketDebuggerUrl);
        console.log('Connected. Running snapshot...');

        const snap = await manager.captureSnapshot(cdp, { fullScroll: false });
        console.log('Nb messages:', snap.messages ? snap.messages.length : 'none', 'error:', snap.error);
        
        cdp.ws.close();
    } catch (e) {
        console.error(e);
    }
}
run();
