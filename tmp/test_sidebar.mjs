import http from 'http';
import WebSocket from 'ws';

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
    const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad' || t.url.includes('antigravity'));
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');

    const SCRIPT = `(async () => {
        const selAuxSidebar = '.bg-sideBar-background.transition-all';
        const selArtHeader = '.bg-sideBar-background.transition-all .text-xs.opacity-50';
        
        const auxSidebar = document.querySelector(selAuxSidebar);
        const artHeaders = document.querySelectorAll(selArtHeader);
        
        return {
            auxSidebarFound: !!auxSidebar,
            artHeadersCount: artHeaders.length,
            artHeaderText: artHeaders.length > 0 ? artHeaders[0].textContent : null
        };
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT, returnByValue: true, awaitPromise: true
    });
    console.log(JSON.stringify(res.result.value, null, 2));
    ws.close();
}

main().catch(console.error);
