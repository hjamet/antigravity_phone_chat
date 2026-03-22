import WebSocket from 'ws';
import http from 'http';

function getDebuggerUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9000/json/list', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const targets = JSON.parse(data);
                const page = targets.find(t => t.type === 'page' && t.url.includes('workbench.html'));
                if (page) resolve(page.webSocketDebuggerUrl);
                else resolve(targets[0].webSocketDebuggerUrl);
            });
        }).on('error', reject);
    });
}

async function test() {
    const wsUrl = await getDebuggerUrl();
    const ws = new WebSocket(wsUrl);
    
    let messageId = 1;
    const pending = {};

    ws.on('open', async () => {
        console.log('Connected.');
        
        const EXP = `(async () => {
             const list = document.querySelector('.absolute.-top-2.-translate-y-full.bg-ide-editor-background');
             if (!list) return { error: "Selector '.absolute.-top-2...' not found" };
             
             const children = Array.from(list.children).map((c, i) => ({
                 index: i,
                 text: c.innerText?.trim() || 'NO TEXT',
                 html: c.outerHTML.substring(0, 100)
             }));
             
             return { found: true, childrenCount: list.children.length, children };
        })()`;
        
        const id = messageId++;
        pending[id] = (result) => {
            console.log("Result for .absolute.-top-2.-translate-y-full.bg-ide-editor-background:");
            console.log(JSON.stringify(result, null, 2));

            const EXP2 = `(async () => {
                 const dialog = document.querySelector('div[role="dialog"][style*="visibility: visible"]');
                 if (!dialog) return { error: "No visible dialog found" };
                 
                 const items = Array.from(dialog.querySelectorAll('.flex.items-center.justify-start.gap-2')).map((c, i) => ({
                     index: i,
                     text: c.innerText?.trim() || '',
                     html: c.outerHTML.substring(0, 100)
                 }));
                 
                 return { foundDialog: true, itemsCount: items.length, items };
            })()`;
            
            const id2 = messageId++;
            pending[id2] = (res2) => {
                console.log("\\nResult for visible dialog:");
                console.log(JSON.stringify(res2, null, 2));
                ws.close();
            };
            ws.send(JSON.stringify({ id: id2, method: 'Runtime.evaluate', params: { expression: EXP2, awaitPromise: true, returnByValue: true } }));
        };
        
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: EXP, awaitPromise: true, returnByValue: true } }));
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && pending[msg.id]) {
            pending[msg.id](msg.result?.result?.value || msg);
            delete pending[msg.id];
        }
    });
}
test();
