import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function callCdp(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === id) {
                ws.removeListener('message', handler);
                if (msg.error) reject(msg.error);
                else resolve(msg.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' && t.url && t.url.includes('workbench-jetski-agent.html'));
    if (!manager) { console.log('Manager not found'); return; }
    
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');

    const SCRIPT = `(async () => {
        return { html: document.body.innerHTML };
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT, returnByValue: true, awaitPromise: true
    });
    
    if (res.result?.value?.error) {
        console.error(res.result.value.error);
    } else if (res.result?.value?.html) {
        fs.writeFileSync('tmp/workflow_dom.html', res.result.value.html);
        console.log("Saved to tmp/workflow_dom.html");
    } else {
        console.log("Unknown result:", res);
    }
    
    ws.close();
}

main().catch(console.error);
