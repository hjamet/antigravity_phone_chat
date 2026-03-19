---
description: Inspect and bind DOM elements in the Antigravity Agent Manager via CDP to fix broken selectors
---

# DOM Inspector & Binding Repair Skill

This skill provides a systematic approach to identify the correct DOM selectors in the Antigravity Agent Manager (or any Electron-based IDE) when UI bindings break due to DOM changes.

## When to Use

- Snapshot captures the wrong element (e.g., artifacts panel instead of chat)
- CDP-based functions return empty results (e.g., `listProjects` returns `[]`)
- Button clicks or text input via CDP fail silently
- The UI shows stale/incorrect data from `getAppState`

## Prerequisite

The Antigravity application must be running with `--remote-debugging-port=9000`.

## Step 1: Create/Update the Inspection Script

Create `test_cdp.js` at the project root. This script connects directly to the CDP target and runs inspection queries.

```javascript
// Template: test_cdp.js
import http from 'http';
import WebSocket from 'ws';

async function getJson(url) { /* ... standard http GET */ }
function callCdp(ws, method, params = {}) { /* ... standard CDP message caller */ }

async function main() {
    const list = await getJson('http://127.0.0.1:9000/json/list');
    const manager = list.find(t => t.title === 'Manager' || t.title === 'Launchpad');
    const ws = new WebSocket(manager.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    await callCdp(ws, 'Runtime.enable');

    const SCRIPT = `(() => {
        // YOUR INSPECTION QUERY HERE
    })()`;

    const res = await callCdp(ws, 'Runtime.evaluate', {
        expression: SCRIPT, returnByValue: true, awaitPromise: true
    });
    console.log(JSON.stringify(res.result.value, null, 2));
    ws.close();
}
main().catch(console.error);
```

Run with: `node test_cdp.js`

## Step 2: Identify the DOM Structure

Run these inspection queries to map the DOM:

### 2a. Find Unique Anchors (IDs, roles, data-attributes)

```javascript
// Find all elements with unique IDs
const idsAndRoles = Array.from(document.querySelectorAll('[id], [role], [data-testid]'))
    .map(el => ({
        id: el.id, role: el.getAttribute('role'),
        testId: el.getAttribute('data-testid'),
        tag: el.tagName, w: el.offsetWidth, h: el.offsetHeight,
        classFirst80: el.className?.substring?.(0, 80)
    }));
```

### 2b. Map the Split Layout (panels side-by-side)

```javascript
// Walk up from a known anchor, check siblings at each level
let current = knownElement;
while (current && current !== document.body) {
    const parent = current.parentElement;
    if (parent.children.length >= 2) {
        const widePanels = Array.from(parent.children)
            .filter(s => s.offsetWidth > 200 && s.offsetHeight > 200);
        if (widePanels.length >= 2) {
            // This is a split layout!
            console.log('Split:', widePanels.map(p => ({
                w: p.offsetWidth, contains: p.contains(knownElement),
                textLen: p.innerText?.length
            })));
        }
    }
    current = parent;
}
```

### 2c. Find Scrollable Containers

```javascript
const scrollables = Array.from(document.querySelectorAll('[class*="overflow-y"]'))
    .filter(el => el.offsetHeight > 200)
    .map(el => ({
        class: el.className?.substring(0, 100),
        w: el.offsetWidth, h: el.offsetHeight,
        scrollHeight: el.scrollHeight, textLen: el.innerText?.length
    }));
```

### 2d. Find Interactive Elements

```javascript
const buttons = Array.from(document.querySelectorAll('button')).slice(0, 30).map(b => ({
    text: b.innerText?.substring(0, 50),
    ariaLabel: b.getAttribute('aria-label'),
    tooltipId: b.getAttribute('data-tooltip-id'),
    w: b.offsetWidth
}));
const editors = document.querySelectorAll('[contenteditable="true"]');
```

## Step 3: Validate the Selector

Before updating `manager.js`, validate your new selector:

```javascript
// In test_cdp.js, simulate the exact same logic as captureSnapshot/injectMessage
const target = document.querySelector('YOUR_NEW_SELECTOR');
return {
    found: !!target,
    isBody: target === document.body,
    tag: target?.tagName,
    w: target?.offsetWidth,
    h: target?.offsetHeight,
    textLen: target?.innerText?.length,
    htmlLen: target?.outerHTML?.length
};
```

## Step 4: Update the Code

Update the relevant function in `src/cdp/manager.js` with the validated selector. Key functions:
- `captureSnapshot()` — What to capture for the snapshot
- `injectMessage()` — Where to type messages
- `listProjects()` — Where to find workspace list
- `getAppState()` — Where to read mode/model/workspace
- `setMode()/setModel()` — Which buttons to click

## Key Patterns in the Agent Manager DOM

| Element | Identification Strategy |
|---------|------------------------|
| **Chat Input Box** | `document.getElementById('antigravity.agentSidePanelInputBox')` |
| **Chat Editor** | `[contenteditable="true"][role="textbox"]` inside inputBox |
| **Chat Messages** | Scrollable with `scrollbar-hide` and `overflow-y`, largest `scrollHeight` |
| **Sidebar** | Div with `offsetWidth < 300`, contains workspace buttons |
| **Workspace Headers** | Buttons containing `keyboard_arrow_down` text |
| **Split Panels** | Parent `flex` container with 2+ children, each `offsetWidth > 200` |
| **Mode Button** | Leaf element containing exactly "Fast" or "Planning" text |
| **Model Button** | Leaf element containing "Gemini", "Claude", or "GPT" |

## Important Notes

- The Manager DOM uses **only Tailwind classes** (no meaningful IDs except `antigravity.agentSidePanelInputBox`)
- Classes may change between versions — prefer structural navigation (walking up/down) over exact class names
- Always have a fallback strategy (e.g., "largest scrollable area" as backup)
- Changes to `src/cdp/manager.js` require a **server restart** (re-run the bat script)
- Changes to `public/js/*.js` only need a **hard refresh** (Ctrl+Shift+R)
