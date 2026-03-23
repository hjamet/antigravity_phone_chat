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

function waitForMessage(ws, check) {
    return new Promise((resolve) => {
        const handler = (data) => {
            const msg = JSON.parse(data);
            if (check(msg)) {
                ws.removeListener('message', handler);
                resolve(msg);
            }
        };
        ws.on('message', handler);
    });
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' && t.url && t.url.includes('workbench-jetski-agent.html'));
    if (!manager) { console.log('Manager not found'); return; }
    
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');
    
    // Get contexts
    const msg = await callCdp(ws, 'Runtime.evaluate', { expression: "typeof window", returnByValue: false });
    
    // Evaluate across all contexts to find the right one
    const SCRIPT = `(async () => {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"]');
        if (!editor) throw new Error("no editor");
        
        const workflowList = document.querySelector('.absolute.-top-2.-translate-y-full.bg-ide-editor-background');
        if (workflowList) {
            return { html: workflowList.outerHTML };
        } else {
            // Check for dialog
            const dialogs = document.querySelectorAll('[role="dialog"]');
            if (dialogs.length > 0) return { dialogsHtml: Array.from(dialogs).map(d => d.outerHTML) };
            
            return { error: "No picker found" };
        }
    })()`;

    // To find the right context, we just loop evaluation contexts?
    // Wait, CDP doesn't give us contexts easily without Page.enable. Let's just use Page.enable!
    await callCdp(ws, 'Page.enable');
    
    // Just inject it into all frames/runtimes?
    // Let's use Runtime.evaluate without contextId, we might get lucky? No, manager.js uses context tracking.
    // Instead of doing manual context logic, why don't we just modify manager.js on the server to print out `.absolute.-top-2` html into server_log.txt when someone opens it!
    
    console.log("Script stopped. Easiest path is writing a test dump in manager.js");
    ws.close();
}

main().catch(console.error);
