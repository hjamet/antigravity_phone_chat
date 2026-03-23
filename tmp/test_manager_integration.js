import http from 'http';
import WebSocket from 'ws';
import { getChatHistory } from '../src/cdp/manager.js';

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

// Minimal CDP connection mock object for manager.js
class FakeCDP {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.contexts = [];
    }
    
    async connect() {
        return new Promise(r => this.ws.on('open', r));
    }
    
    call(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = Math.floor(Math.random() * 100000);
            const handler = (data) => {
                const msg = JSON.parse(data);
                if (msg.id === id) {
                    this.ws.removeListener('message', handler);
                    if (msg.error) reject(msg.error);
                    else resolve(msg.result);
                }
            };
            this.ws.on('message', handler);
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const managerUrl = list.find(t => t.title === 'Manager' || t.title === 'Launchpad' || t.url.includes('antigravity')).webSocketDebuggerUrl;
    
    const cdp = new FakeCDP(managerUrl);
    await cdp.connect();
    await cdp.call('Runtime.enable');
    
    // Simulate finding contexts
    const ctxRes = await cdp.call('Runtime.evaluate', { expression: '1+1', returnByValue: true });
    // This is just a mock for contexts if manager.js uses it, but it actually runs inside the page.

    console.log("Testing getChatHistory via manager.js ...");
    const result = await getChatHistory(cdp);
    
    console.log("Chats returned:", result.chats.length);
    const unread = result.chats.filter(c => c.isFinished);
    console.log("Unread chats:", unread);
    
    process.exit(0);
}

main().catch(console.error);
