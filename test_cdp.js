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
        const listener = (msg) => {
            const data = JSON.parse(msg);
            if (data.id === id) {
                ws.removeListener('message', listener);
                if (data.error) reject(new Error(data.error.message));
                else resolve(data);
            }
        };
        ws.on('message', listener);
        ws.send(JSON.stringify({ id, method, params }));
    });
}



import fs from 'fs';

const dom = fs.readFileSync('dom_dump.html', 'utf8');

const userMsg = dom.match(/class="[^"]*bg-gray-500[^"]*select-text[^"]*"/);
const agentBlock = dom.match(/class="[^"]*isolate[^"]*mb-2[^"]*"/);
console.log("User Message Block:", userMsg ? userMsg[0] : "Not found");
console.log("Agent Task Block:", agentBlock ? agentBlock[0] : "Not found");
console.log("Webview:", dom.match(/<webview[^>]*>/));



