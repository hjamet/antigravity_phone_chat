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

    // 1) Understanding accordion/section structure by scrolling through all turns
    // 2) Finding copy/thumbs buttons
    // 3) Finding the "Open Workspace" button and what it triggers
    const SCRIPT = `(async () => {
        try {
            const chatScroll = Array.from(document.querySelectorAll('[class*="scrollbar-hide"][class*="overflow-y"]'))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            
            if (!chatScroll) return { error: 'No chat scroll' };
            
            const wrapper = chatScroll.children[0];
            let turnsContainer = wrapper;
            if (wrapper.children[0]) {
                const cls = wrapper.children[0].className || '';
                if (cls.includes('flex') && cls.includes('gap')) {
                    turnsContainer = wrapper.children[0];
                }
            }
            
            const totalChildren = turnsContainer.children.length;
            
            // Scroll through to collect all turns
            const allTurns = [];
            const scrollStep = chatScroll.clientHeight * 0.8;
            const originalScroll = chatScroll.scrollTop;
            
            // Start from top
            chatScroll.scrollTop = 0;
            await new Promise(r => setTimeout(r, 300));
            
            // Collect turns at each scroll position
            const seenIndices = new Set();
            let scrollPos = 0;
            
            while (scrollPos <= chatScroll.scrollHeight) {
                chatScroll.scrollTop = scrollPos;
                await new Promise(r => setTimeout(r, 150));
                
                for (let i = 0; i < turnsContainer.children.length; i++) {
                    if (seenIndices.has(i)) continue;
                    const turn = turnsContainer.children[i];
                    const text = (turn.innerText || '').trim();
                    if (text.length > 0) {
                        seenIndices.add(i);
                        
                        // Check for accordion/section structure
                        const children = Array.from(turn.children);
                        const hasSummary = !!turn.querySelector('summary, details');
                        const hasCollapseToggle = children.some(c => 
                            (c.className || '').includes('collapse') || 
                            (c.className || '').includes('accordion') ||
                            (c.innerText || '').includes('▶') ||
                            (c.innerText || '').includes('▼')
                        );
                        
                        // Check for copy/thumbs buttons
                        const buttons = turn.querySelectorAll('button');
                        const actionButtons = Array.from(buttons).filter(b => {
                            const t = (b.innerText || '').toLowerCase();
                            const label = (b.getAttribute('aria-label') || '').toLowerCase();
                            return t.includes('copy') || t.includes('thumb') || 
                                   label.includes('copy') || label.includes('thumb') ||
                                   label.includes('good') || label.includes('bad') ||
                                   label.includes('feedback');
                        });
                        
                        allTurns.push({
                            index: i,
                            textLen: text.length,
                            textStart: text.substring(0, 80),
                            textEnd: text.substring(Math.max(0, text.length - 80)),
                            childCount: children.length,
                            h: turn.offsetHeight,
                            hasSummary,
                            hasCollapseToggle,
                            actionButtonCount: actionButtons.length,
                            actionButtonLabels: actionButtons.map(b => 
                                b.getAttribute('aria-label') || b.innerText?.substring(0, 20)),
                            // Check for svg buttons (copy/thumbs often use SVG)
                            svgButtonCount: Array.from(buttons).filter(b => b.querySelector('svg')).length,
                        });
                    }
                }
                
                scrollPos += scrollStep;
                if (scrollPos > chatScroll.scrollHeight + scrollStep) break;
            }
            
            // Restore scroll
            chatScroll.scrollTop = originalScroll;
            
            // Model selector: click the model button, read options, then close
            let availableModels = [];
            const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
            if (inputBox) {
                const parent = inputBox.parentElement?.parentElement?.parentElement;
                if (parent) {
                    const modelBtns = Array.from(parent.querySelectorAll('button'))
                        .filter(b => {
                            const t = b.innerText || '';
                            return ['Claude', 'Gemini', 'GPT', 'Model'].some(k => t.includes(k));
                        });
                    
                    if (modelBtns.length > 0) {
                        const modelBtn = modelBtns[0];
                        modelBtn.click();
                        await new Promise(r => setTimeout(r, 500));
                        
                        // Find the opened dropdown/dialog
                        const poppers = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="listbox"], [role="menu"], [role="dialog"]'))
                            .filter(d => d.offsetHeight > 0);
                        
                        for (const popper of poppers) {
                            const opts = Array.from(popper.querySelectorAll('[role="option"], [role="menuitem"], [class*="cursor-pointer"]'))
                                .map(o => o.innerText?.trim())
                                .filter(t => t && t.length > 2 && t.length < 60);
                            if (opts.length > 0) availableModels = opts;
                        }
                        
                        // If no role-based options, look for all text leaves in popper
                        if (availableModels.length === 0 && poppers.length > 0) {
                            const leaves = Array.from(poppers[0].querySelectorAll('*'))
                                .filter(el => el.children.length === 0 && el.innerText?.trim().length > 2)
                                .map(el => el.innerText.trim())
                                .filter(t => t.length < 60);
                            availableModels = leaves;
                        }
                        
                        // Close by pressing Escape
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        await new Promise(r => setTimeout(r, 200));
                    }
                }
            }
            
            // Open Workspace button analysis
            const openWsBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.getAttribute('aria-label') === 'Open Workspace');
            
            return {
                totalTurnChildren: totalChildren,
                renderedTurns: allTurns,
                availableModels,
                openWsBtnFound: !!openWsBtn,
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
