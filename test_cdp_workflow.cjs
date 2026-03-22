const WebSocket = require('ws');
const http = require('http');

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

function sendCommand(ws, method, params = {}) {
    return new Promise((resolve) => {
        const id = Math.floor(Math.random() * 1000000);
        const listener = (data) => {
            const msg = JSON.parse(data);
            if (msg.id === id) {
                ws.removeListener('message', listener);
                resolve(msg.result || msg);
            }
        };
        ws.on('message', listener);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function test() {
    const wsUrl = await getDebuggerUrl();
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', async () => {
        console.log('Connected. Focusing editor and clearing...');

        const focusExp = `(async () => {
            const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
            if (editor) {
                editor.focus();
                document.execCommand("selectAll", false, null);
                document.execCommand("delete", false, null);
                return { success: true };
            }
            return { error: 'Editor not found' };
        })()`;
        
        await sendCommand(ws, 'Runtime.evaluate', { expression: focusExp, awaitPromise: true });

        console.log('Typing "/" via execCommand...');
        const typeExp = `(async () => {
            document.execCommand("insertText", false, "/");
            return { success: true };
        })()`;
        await sendCommand(ws, 'Runtime.evaluate', { expression: typeExp, awaitPromise: true });
        
        await new Promise(r => setTimeout(r, 1000));
        
        console.log('Checking popup...');
        const clickListExp = `(async () => {
             const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(el => el.offsetWidth > 10);
             if (dialogs.length === 0) return { error: "No visible dialog" };
             
             const dialog = dialogs[dialogs.length - 1]; // Picker is usually the last one
             const opts = Array.from(dialog.querySelectorAll('.flex.items-center.justify-start.gap-2'));
             
             if(opts[2]) {
                 opts[2].click();
                 return { success: true, count: dialogs.length, options: opts.length };
             }
             return { error: "Option 3 (Workflows) not found. Found: " + opts.length };
        })()`;
        
        const clickRes = await sendCommand(ws, 'Runtime.evaluate', { expression: clickListExp, awaitPromise: true, returnByValue: true });
        console.log("Category click:", JSON.stringify(clickRes.result?.value || clickRes, null, 2));

        await new Promise(r => setTimeout(r, 1000));

        console.log('Capturing DOM for workflows list...');
        const EXP = `(async () => {
             const typeahead = document.querySelector('div[role="listbox"][aria-label="Typeahead menu"]');
             
             const workflowList = document.querySelector('.absolute.-top-2.-translate-y-full.bg-ide-editor-background');
             
             return { 
                 typeaheadFound: !!typeahead,
                 typeaheadChildren: typeahead ? typeahead.children.length : 0,
                 workflowListFound: !!workflowList,
                 workflowChildren: workflowList ? workflowList.children.length : 0,
                 workflowHtml: workflowList ? workflowList.outerHTML.substring(0, 500) : null
             };
        })()`;
        
        const res = await sendCommand(ws, 'Runtime.evaluate', { expression: EXP, awaitPromise: true, returnByValue: true });
        console.log("\\nDOM Capture:");
        console.log(JSON.stringify(res.result?.value || res, null, 2));

        ws.close();
    });
}
test();
