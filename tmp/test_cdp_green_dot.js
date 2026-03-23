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
        const SEL = { history: { conversationPill: '[data-testid^="convo-pill-"]' } };
        let pills = document.querySelectorAll(SEL.history.conversationPill);
        let dotsFound = [];
        
        Array.from(pills).forEach(pill => {
            const btn = pill.closest('button');
            if (btn) {
                // Find all divs that might be a colored dot
                // Look for bg-green, bg-orange, rounded-full, or inside the w-4 h-4 wrapper
                const potentialDots = Array.from(btn.querySelectorAll('div')).filter(d => 
                    d.className.includes('bg-') && d.className.includes('rounded-full') ||
                    d.className.includes('green') || d.className.includes('accent')
                );
                
                // Also check what's inside the first w-4 h-4 div
                const w4h4 = btn.querySelector('.w-4.h-4');
                const innerHtml = w4h4 ? w4h4.innerHTML : null;
                
                if (potentialDots.length > 0 || (innerHtml && innerHtml.trim() !== '')) {
                    dotsFound.push({
                        title: pill.textContent.trim(),
                        w4h4_inner: innerHtml,
                        potentialDots: potentialDots.map(d => d.outerHTML)
                    });
                }
            }
        });
        
        return { dotsFound };
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT, returnByValue: true, awaitPromise: true
    });
    console.log(JSON.stringify(res.result.value, null, 2));
    ws.close();
}

main().catch(console.error);
