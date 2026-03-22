/**
 * Verification script for New Chat functionality
 * Tests if injectMessage can find the submit button on a New Conversation page
 */
import http from 'http';
import WebSocket from 'ws';
import { SELECTORS } from './src/config/selectors.js';

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', ch => data += ch);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

let msgId = 1;
function callCdp(ws, method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`CDP timeout for ${method}`)), 10000);
        const handler = (raw) => {
            const parsed = JSON.parse(raw.toString());
            if (parsed.id === id) {
                clearTimeout(timeout);
                ws.off('message', handler);
                resolve(parsed.result || parsed);
            }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });
}

async function verify() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad');
    if (!manager) {
        console.error('Manager target not found');
        return;
    }

    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');

    const SCRIPT = `(() => {
        const SEL = ${JSON.stringify(SELECTORS)};
        const submitBtn = document.querySelector(SEL.controls.submitButton);
        return {
            selectorUsed: SEL.controls.submitButton,
            found: !!submitBtn,
            tooltipId: submitBtn?.getAttribute('data-tooltip-id'),
            visible: submitBtn ? submitBtn.offsetParent !== null : false,
            text: submitBtn?.innerText
        };
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', { expression: SCRIPT, returnByValue: true });
    console.log('=== Submit Button Verification ===');
    console.log(JSON.stringify(res.result.value, null, 2));

    ws.close();
}

verify().catch(console.error);
