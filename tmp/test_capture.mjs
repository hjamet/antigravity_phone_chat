import * as managerCdp from '../src/cdp/manager.js';
import http from 'http';
import WebSocket from 'ws';

async function discoverCDP() {
    for (const port of [9000, 9001, 9002, 9003]) {
        try {
            const list = await new Promise((resolve, reject) => {
                http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
                    let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(JSON.parse(data)));
                }).on('error', reject);
            });
            const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad' || t.url?.includes('jetski'));
            if (manager) return { port, url: manager.webSocketDebuggerUrl };
        } catch (e) {}
    }
}
async function run() {
    const target = await discoverCDP();
    if (!target) return console.log('No CDP');
    console.log("Found manager on", target.port);
    const ws = new WebSocket(target.url);
    await new Promise(r => ws.on('open', r));
    let _id = 1;
    let contexts = [];
    const call = (method, params) => new Promise(r => {
        const id = _id++;
        ws.send(JSON.stringify({id, method, params}));
        const f = msg => { const d = JSON.parse(msg); if(d.id===id) { ws.removeListener('message', f); r(d.result); } };
        ws.on('message', f);
    });
    ws.on('message', msg => {
        const d = JSON.parse(msg);
        if (d.method === 'Runtime.executionContextCreated') contexts.push(d.params.context);
    });
    await call('Runtime.enable', {});
    await new Promise(r => setTimeout(r, 500));
    
    // Test chatScroll selector logic explicitly
    console.log("Evaluating chatScroll explicitly...");
    const testCode = `(() => {
        const SEL = { chat: { scrollContainer: '.flex-1.overflow-y-auto, .flex-1.overflow-x-hidden, .overflow-y-auto.flex-1' } };
        const el = Array.from(document.querySelectorAll(SEL.chat.scrollContainer)).filter(el => el.scrollHeight > 100 && el.offsetWidth > 200).sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
        return el ? { found: true, scrollHeight: el.scrollHeight, offsetWidth: el.offsetWidth, classes: el.className } : { found: false, all: Array.from(document.querySelectorAll('*')).filter(e=>e.scrollHeight>100).map(e=>e.className) };
    })()`;
    for(const ctx of contexts) {
       const res = await call("Runtime.evaluate", { expression: testCode, returnByValue: true, contextId: ctx.id });
       console.log("Eval in ctx", ctx.id, ":", res.value);
    }
    
    const cdp = { ws, call, contexts };
    console.log("Running captureSnapshot...");
    const snap = await managerCdp.captureSnapshot(cdp, { fullScroll: false });
    console.log(JSON.stringify(snap, null, 2));
    process.exit(0);
}
run();
