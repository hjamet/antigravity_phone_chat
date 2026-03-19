import http from 'http';
import WebSocket from 'ws';

async function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

function callCdp(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = Math.floor(Math.random() * 100000);
        const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad');
    if (!manager) { console.error("No Manager found"); return; }
    
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');

    // Strategy: scroll to bottom (where latest messages are visible) and read rendered content
    const SCRIPT = `(async () => {
        try {
            const chatScroll = Array.from(document.querySelectorAll('[class*="scrollbar-hide"][class*="overflow-y"]'))
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            
            // Scroll to the very bottom to have the latest messages rendered
            chatScroll.scrollTop = chatScroll.scrollHeight;
            await new Promise(r => setTimeout(r, 300));
            
            const wrapper = chatScroll.children[0];
            const turnsContainer = wrapper.children[0];
            
            // Now check which children have content  
            const renderedTurns = [];
            for (let i = 0; i < turnsContainer.children.length; i++) {
                const turn = turnsContainer.children[i];
                const text = turn.innerText || '';
                if (text.length === 0) continue;
                
                // This turn is rendered!
                // Check if it has a "rounded-lg bg-gray-500/10" child = user bubble
                const children = Array.from(turn.children);
                const hasBubble = children.some(c => (c.className || '').includes('rounded-lg') && (c.className || '').includes('bg-gray'));
                const hasMarkdown = !!turn.querySelector('p, pre, code, table, ul, ol');
                
                renderedTurns.push({
                    index: i,
                    textLen: text.length,
                    textStart: text.substring(0, 100),
                    childCount: turn.children.length,
                    hasBubble: hasBubble,
                    hasMarkdown: hasMarkdown,
                    h: turn.offsetHeight,
                    top: turn.offsetTop,
                    // Deeper: look at children classes
                    childClasses: children.slice(0, 3).map(c => ({
                        tag: c.tagName,
                        classShort: (c.className || '').substring(0, 80),
                        textLen: c.innerText?.length || 0,
                        textStart: (c.innerText || '').substring(0, 50),
                        childCount: c.children?.length,
                    })),
                });
            }
            
            // Also scroll to top to see user's first message
            chatScroll.scrollTop = 0;
            await new Promise(r => setTimeout(r, 300));
            
            const topTurns = [];
            for (let i = 0; i < turnsContainer.children.length; i++) {
                const turn = turnsContainer.children[i];
                const text = turn.innerText || '';
                if (text.length === 0) continue;
                
                const children = Array.from(turn.children);
                const hasBubble = children.some(c => (c.className || '').includes('rounded-lg') && (c.className || '').includes('bg-gray'));
                
                topTurns.push({
                    index: i,
                    textLen: text.length,
                    textStart: text.substring(0, 100),
                    hasBubble: hasBubble,
                    childClasses: children.slice(0, 3).map(c => ({
                        tag: c.tagName,
                        classShort: (c.className || '').substring(0, 80),
                        textLen: c.innerText?.length || 0,
                        textStart: (c.innerText || '').substring(0, 50),
                    })),
                });
                if (topTurns.length >= 4) break;
            }
            
            return { 
                totalTurnChildren: turnsContainer.children.length,
                bottomRendered: renderedTurns,
                topRendered: topTurns,
            };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT,
        returnByValue: true,
        awaitPromise: true
    });
    
    console.log(JSON.stringify(res.result.value, null, 2));
    ws.close();
}

main().catch(console.error);
