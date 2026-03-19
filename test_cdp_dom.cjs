const http = require('http');
const WebSocket = require('ws');

function getTargets() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:9000/json', res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}

function cdpEval(wsUrl, expr) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on('open', () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
        });
        ws.on('message', msg => {
            const r = JSON.parse(msg);
            if (r.id === 1) {
                resolve(r.result?.result?.value);
                ws.close();
            }
        });
        ws.on('error', reject);
        setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
    });
}

async function main() {
    const targets = await getTargets();
    const manager = targets.find(t => t.title === 'Manager');
    if (!manager) return;
    
    // Inspect child[1] (the noise child) structure
    const script = `
    (() => {
        const isos = document.querySelectorAll('[class*="isolate"]');
        const last = isos[isos.length - 1];
        if (!last || last.children.length < 2) return { error: 'no child[1]' };
        
        const noise = last.children[1];
        function dumpEl(el, depth) {
            const text = (el.innerText || '').trim();
            return {
                tag: el.tagName,
                cls: (el.className||'').substring(0, 100),
                hasBorderT: (el.className||'').includes('border-t'),
                textPreview: text.substring(0, 100),
                childCount: el.children.length,
                children: depth < 2 ? Array.from(el.children).slice(0, 6).map(c => dumpEl(c, depth + 1)) : undefined
            };
        }
        
        return dumpEl(noise, 0);
    })()
    `;
    
    const result = await cdpEval(manager.webSocketDebuggerUrl, script);
    console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
