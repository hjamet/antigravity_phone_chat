import { snapshotSchema } from '../src/schemas/snapshot.js';
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
    const cdp = { ws, call, contexts };
    const snap = await managerCdp.captureSnapshot(cdp, { fullScroll: false });
    
    console.log("Snapshot retrieved. Running validation...");
    const val = snapshotSchema.safeParse(snap);
    if (!val.success) {
        console.log(JSON.stringify(val.error.format(), null, 2));
    } else {
        console.log("Validation SUCCESS!");
    }
    process.exit(0);
}
run();
