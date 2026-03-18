import WebSocket from 'ws';
import http from 'http';
import fs from 'fs';

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

async function main() {
    const targetName = process.argv[2] || 'Launchpad';
    const outputFile = process.argv[3] || '../scratch/dom_snapshot.html';
    
    console.log(`Looking for target: "${targetName}"`);
    
    const list = await getJson('http://127.0.0.1:9000/json/list');
    
    console.log('Available targets:');
    list.forEach(t => console.log(`  [${t.type}] "${t.title}" — ${t.url?.substring(0, 80)}`));
    
    const target = list.find(t => t.title.includes(targetName));
    if (!target) {
        console.log(`\nTarget "${targetName}" not found.`);
        process.exit(1);
    }
    
    console.log(`\nConnecting to: "${target.title}"`);
    
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
    });
    
    let idCounter = 1;
    const pendingCalls = new Map();
    
    ws.on('message', (msg) => {
        const data = JSON.parse(msg);
        if (data.id !== undefined && pendingCalls.has(data.id)) {
            const { resolve, reject } = pendingCalls.get(data.id);
            pendingCalls.delete(data.id);
            if (data.error) reject(data.error);
            else resolve(data.result);
        }
    });
    
    const call = (method, params) => new Promise((resolve, reject) => {
        const id = idCounter++;
        pendingCalls.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
            if (pendingCalls.has(id)) {
                pendingCalls.delete(id);
                reject(new Error('Timeout'));
            }
        }, 15000);
    });
    
    await call('Runtime.enable', {});
    await new Promise(r => setTimeout(r, 1000));

    // Export full raw HTML
    const result = await call('Runtime.evaluate', {
        expression: `document.documentElement.outerHTML`,
        returnByValue: true
    });
    
    const html = result.result?.value || 'No result';
    fs.writeFileSync(outputFile, html, 'utf8');
    console.log(`Exported to ${outputFile} (${html.length} chars)`);
    
    ws.close();
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
