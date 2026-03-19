import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';

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
        const handler = (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.id === id) {
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
    try {
        console.log("Fetching targets from :9000...");
        const list = await getJson('http://127.0.0.1:9000/json/list');
        const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad' || t.url?.includes('jetski'));
        
        if (!manager) {
            console.error("Manager target not found in list:", list.map(l => l.title));
            return;
        }
        
        console.log("Manager target found:", manager.title, manager.webSocketDebuggerUrl);
        const ws = new WebSocket(manager.webSocketDebuggerUrl);
        await new Promise(r => ws.on('open', r));
        console.log("WebSocket connected.");

        // Fetch execution contexts to find the right one (usually main world)
        await callCdp(ws, 'Runtime.enable');
        let contexts = [];
        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.method === 'Runtime.executionContextCreated') {
                contexts.push(msg.params.context);
            }
        });
        await new Promise(r => setTimeout(r, 1000)); // wait for contexts to arrive
        
        console.log("Contexts found:", contexts.map(c => c.id + " " + c.origin));

        const SCRIPT = `(async () => {
            try {
                const cascade = document.getElementById('conversation') || 
                                document.querySelector('#conversation > div.relative.flex.flex-col') ||
                                document.querySelector('[data-testid="chat-container"]') ||
                                document.querySelector('.flex.flex-col.overflow-y-auto.grow') ||
                                document.querySelector('#antigravity.agentSidePanelInputBox')?.closest('.flex.flex-col') ||
                                document.body; 

                if (!cascade) {
                    return { error: 'No suitable container found even after body fallback' };
                }
                
                return { success: true, tagName: cascade.tagName, id: cascade.id, className: cascade.className, htmlLength: cascade.outerHTML.length };
            } catch(e) {
                return { error: e.toString(), stack: e.stack };
            }
        })()`;

        console.log("Evaluating in default context...");
        try {
            const res = await callCdp(ws, 'Runtime.evaluate', {
                expression: SCRIPT,
                returnByValue: true,
                awaitPromise: true
            });
            console.log("Result:", JSON.stringify(res, null, 2));
        } catch (err) {
            console.error("Error evaluating:", err.message);
        }
        
        ws.close();
    } catch (e) {
        console.error("Fatal:", e);
    }
}

main();
