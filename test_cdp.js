/**
 * CDP DOM Inspector for New Conversation page
 * Explores the DOM structure when a "fresh" conversation is open (no messages yet)
 */
import http from 'http';
import WebSocket from 'ws';

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
        const timeout = setTimeout(() => reject(new Error(`CDP timeout for ${method}`)), 15000);
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

async function inspectTarget(target) {
    console.log(`\n>>> Connecting to: ${target.title} (${target.url?.substring(0, 60)})`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    });

    try {
        await callCdp(ws, 'Runtime.enable');
    } catch (e) {
        console.log(`  Runtime.enable failed: ${e.message}`);
        ws.close();
        return;
    }

    const SCRIPT = `(() => {
        const result = {};
        
        // 1. Input Box
        const inputBox = document.querySelector('#antigravity\\\\.agentSidePanelInputBox');
        result.inputBox = {
            found: !!inputBox,
            id: inputBox?.id,
            tag: inputBox?.tagName,
            w: inputBox?.offsetWidth,
            h: inputBox?.offsetHeight,
        };
        
        // 2. ContentEditable editors
        const eds = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        result.editors = eds.map(el => ({
            tag: el.tagName,
            role: el.getAttribute('role'),
            w: el.offsetWidth,
            h: el.offsetHeight,
            parentId: el.parentElement?.id || '',
            placeholder: el.getAttribute('aria-placeholder') || el.getAttribute('data-placeholder') || '',
            textLen: el.innerText?.length || 0,
        }));
        
        // 3. Submit button
        const submitBtn = document.querySelector('[data-tooltip-id="input-send-button-pending-tooltip"]');
        result.submitBtn = {
            found: !!submitBtn,
            visible: submitBtn ? submitBtn.offsetParent !== null : false,
            text: submitBtn?.innerText?.substring(0, 30),
        };
        
        // 4. Chat scroll containers
        const scrolls = Array.from(document.querySelectorAll('[class*="scrollbar-hide"][class*="overflow-y"]'));
        result.scrollContainers = scrolls.map(el => ({
            w: el.offsetWidth,
            h: el.offsetHeight,
            scrollH: el.scrollHeight,
            children: el.children.length,
            textLen: el.innerText?.length || 0,
        }));
        
        // 5. All IDs present
        result.allIds = Array.from(document.querySelectorAll('[id]'))
            .filter(el => el.offsetWidth > 0)
            .map(el => ({ id: el.id, tag: el.tagName, w: el.offsetWidth, h: el.offsetHeight }));
        
        // 6. Buttons
        result.buttons = Array.from(document.querySelectorAll('button'))
            .filter(b => b.offsetParent !== null)
            .slice(0, 30)
            .map(b => ({
                text: b.innerText?.substring(0, 40),
                ariaLabel: b.getAttribute('aria-label'),
                tooltipId: b.getAttribute('data-tooltip-id'),
                w: b.offsetWidth,
            }));
        
        // 7. Controls row
        const cr = document.querySelector('.mt-1.flex.w-full.items-center.justify-between');
        result.controlsRow = {
            found: !!cr,
            text: cr?.innerText?.substring(0, 100),
        };
        
        // 8. Textareas and inputs
        result.textInputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'))
            .map(el => ({
                tag: el.tagName,
                w: el.offsetWidth,
                h: el.offsetHeight,
                placeholder: el.placeholder?.substring(0, 60),
                classes: el.className?.substring(0, 80),
            }));
            
        // 9. All elements with data-tooltip-id
        result.tooltips = Array.from(document.querySelectorAll('[data-tooltip-id]'))
            .filter(el => el.offsetParent !== null)
            .map(el => ({
                tooltipId: el.getAttribute('data-tooltip-id'),
                tag: el.tagName,
                text: el.innerText?.substring(0, 30),
                w: el.offsetWidth,
            }));

        // 10. div[role="button"] sidebar nav
        const navBtns = Array.from(document.querySelectorAll('div[role="button"]'))
            .filter(d => d.offsetParent !== null);
        result.navButtons = navBtns.map(btn => {
            const icon = btn.querySelector('.google-symbols');
            return {
                iconText: icon?.textContent?.trim(),
                w: btn.offsetWidth,
                h: btn.offsetHeight,
                classes: btn.className?.substring(0, 80),
            };
        });

        return result;
    })()`;

    try {
        const res = await callCdp(ws, 'Runtime.evaluate', {
            expression: SCRIPT,
            returnByValue: true,
        });
        if (res.result?.value) {
            const val = res.result.value;
            console.log('\n--- Input Box ---');
            console.log(JSON.stringify(val.inputBox, null, 2));
            console.log('\n--- Editors ---');
            console.log(JSON.stringify(val.editors, null, 2));
            console.log('\n--- Submit Button ---');
            console.log(JSON.stringify(val.submitBtn, null, 2));
            console.log('\n--- Scroll Containers ---');
            console.log(JSON.stringify(val.scrollContainers, null, 2));
            console.log('\n--- All IDs ---');
            console.log(JSON.stringify(val.allIds, null, 2));
            console.log('\n--- Buttons ---');
            console.log(JSON.stringify(val.buttons, null, 2));
            console.log('\n--- Controls Row ---');
            console.log(JSON.stringify(val.controlsRow, null, 2));
            console.log('\n--- Text Inputs ---');
            console.log(JSON.stringify(val.textInputs, null, 2));
            console.log('\n--- Tooltip Elements ---');
            console.log(JSON.stringify(val.tooltips, null, 2));
            console.log('\n--- Nav Buttons ---');
            console.log(JSON.stringify(val.navButtons, null, 2));
        } else {
            console.log('  No value returned:', JSON.stringify(res, null, 2));
        }
    } catch (e) {
        console.log(`  Eval failed: ${e.message}`);
    }

    ws.close();
}

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    console.log('=== CDP Targets ===');
    list.forEach(t => console.log(`  ${t.title} | ${t.type} | ${t.url?.substring(0, 70)}`));

    // Try Manager first, then Launchpad
    const targets = list.filter(t => t.title === 'Manager' || t.title === 'Launchpad');
    if (targets.length === 0) {
        console.error('No Manager/Launchpad target!');
        process.exit(1);
    }

    for (const target of targets) {
        await inspectTarget(target);
    }

    console.log('\n=== Done ===');
}

main().catch(console.error);
