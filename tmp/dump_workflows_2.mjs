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
        try {
            const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
            if (editor) {
                editor.focus();
                document.execCommand("selectAll", false, null);
                document.execCommand("delete", false, null);
                await new Promise(r => setTimeout(r, 100));

                document.execCommand("insertText", false, "/");
                await new Promise(r => setTimeout(r, 1500)); 
                
                // Also trigger workflows category click if dialog is here
                const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
                if (dialogs.length > 0) {
                    const dialog = dialogs[dialogs.length - 1];
                    const categoryBtns = dialog.querySelectorAll('.flex.items-center.justify-start.gap-2');
                    if (categoryBtns.length >= 3) {
                        categoryBtns[2].click();
                        await new Promise(r => setTimeout(r, 1500)); 
                    }
                }
            }
            return { html: document.body.innerHTML };
        } catch (e) {
            return { error: e.message };
        }
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT, returnByValue: true, awaitPromise: true
    });
    
    if (res.result?.value?.error) {
        console.error("Error from CDP:", res.result.value.error);
    } else {
        fs.writeFileSync('tmp/picker_analysis.html', res.result?.value?.html || '');
        console.log("Saved to tmp/picker_analysis.html");
    }
    
    ws.close();
}

main().catch(console.error);
