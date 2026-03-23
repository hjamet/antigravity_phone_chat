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

function waitForEvent(ws, eventName) {
    return new Promise(resolve => {
        const h = msg => {
            const data = JSON.parse(msg);
            if (data.method === eventName) {
                ws.removeListener('message', h);
                resolve(data.params);
            }
        };
        ws.on('message', h);
    });
}

async function getExecutionCtxs(ws) {
    const contexts = [];
    const h = msg => {
        const data = JSON.parse(msg);
        if (data.method === 'Runtime.executionContextCreated') {
            contexts.push(data.params.context);
        }
    };
    ws.on('message', h);
    await callCdp(ws, 'Runtime.enable');
    await new Promise(r => setTimeout(r, 1000));
    ws.removeListener('message', h);
    return contexts;
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' && t.url && t.url.includes('workbench-jetski-agent.html'));
    if (!manager) { console.log('Manager not found'); return; }
    
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    const contexts = await getExecutionCtxs(ws);
    
    const EXPRESSION = `(async () => {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        if (!editor) throw new Error("No editor");
        
        editor.focus();
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
        await new Promise(r => setTimeout(r, 100));

        document.execCommand("insertText", false, "/");
        await new Promise(r => setTimeout(r, 1000));

        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
        if (dialogs.length === 0) throw new Error("No dialog");
        
        const dialog = dialogs[dialogs.length - 1];
        const categoryBtns = dialog.querySelectorAll('.flex.items-center.justify-start.gap-2');
        if (categoryBtns.length < 3) throw new Error("No category btn");
        
        categoryBtns[2].click();
        await new Promise(r => setTimeout(r, 1000));
        
        return { html: document.body.innerHTML };
    })()`;

    for (const ctx of contexts) {
        try {
            const res = await callCdp(ws, "Runtime.evaluate", {
                expression: EXPRESSION,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value?.html) {
                fs.writeFileSync('tmp/real_picker_dom.html', res.result.value.html);
                console.log("Saved to tmp/real_picker_dom.html");
                ws.close();
                return;
            }
        } catch (e) { }
    }
    
    console.log("Failed to find valid context and dump html.");
    ws.close();
}

main().catch(console.error);
