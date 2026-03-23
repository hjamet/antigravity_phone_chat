/**
 * CDP Scripts and helpers specifically for the Antigravity Agent Manager (formerly Launchpad)
 * This is now the primary target for chat interactions, snapshots, and project management.
 */

import { SELECTORS } from '../config/selectors.js';

import fs from 'fs';
import path from 'path';
import { processSelectorError } from './selector_error.js';

let selectorErrorHandler = null;

/**
 * Configure un handler pour les erreurs de sélecteur CDP.
 */
export function onSelectorError(handler) {
    selectorErrorHandler = handler;
}

/**
 * Exécute un script CDP et gère les dumps DOM en cas d'erreur de sélecteur.
 */
async function runCdpScript(cdp, expression, functionName = 'Unknown') {
    if (!cdp) return { error: 'Not connected' };
    
    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            
            if (res.result?.value) {
                const val = res.result.value;
                if (val.error && val.domDump) {
                    const errorReport = processSelectorError(val, functionName);
                    
                    console.error(`
❌ [CRASH SILENCIEUX ÉVITÉ] Erreur CDP dans la fonction: ${functionName}()`);
                    console.error(`   Message: ${errorReport.error}`);
                    if (errorReport.lastValidRoot) {
                        console.error(`   Dernière racine commune trouvée (Extrait):
     ${errorReport.lastValidRoot.trim()}`);
                    }
                    console.error(`
   👉 Fichier DOM complet généré : ${errorReport.domFilePath}
`);
                    
                    if (selectorErrorHandler) {
                        selectorErrorHandler(errorReport);
                    }
                    
                    delete val.domDump;
                    delete val.lastValidRoot;
                    return val;
                }
                
                // Si pas d'erreur ou erreur sans domDump
                if (!val.error || val.messages || val.models) return val; 
                if (val.error) return val; // Return the error correctly
            }
        } catch (e) {
            // Le contexte a échoué
        }
    }
    return { error: 'Target unavailable or context failed' };
}



/**
 * Capture a snapshot of the current chat UI from the Manager
 */
export async function captureSnapshot(cdp, options = { fullScroll: false }) {
    if (!cdp) return null;

    const CAPTURE_SCRIPT = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const chatScroll = Array.from(document.querySelectorAll(SEL.chat.scrollContainer))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            
            if (!chatScroll) {
                // If no scroll container, we might be on a "New Chat" page with no messages yet.
                // This is normal. Return empty messages instead of throwing error.
                return { messages: [], isFull: false, isStreaming: false, scrollInfo: { scrollTop: 0, scrollHeight: 0, clientHeight: 0 } };
            }
            
            const originalScroll = chatScroll.scrollTop;
            const scrollHeight = chatScroll.scrollHeight;
            const clientHeight = chatScroll.clientHeight;
            const wrapper = chatScroll.children[0];
            if (!wrapper) throw new Error('[CDP] Chat wrapper not found');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = wrapper;
            
            const inner = wrapper.children[0];
            if (!inner) throw new Error('[CDP] Chat inner div not found');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inner;
            
            const turnsDiv = inner.querySelector(SEL.chat.turnsContainer) || inner;
            
            const collected = [];
            const seen = new Set();
            
            function extractVisible() {
                const turns = Array.from(turnsDiv.children);
                for (const turn of turns) {
                    // 1. USER Messages
                    // Filter: must be a real message block (large enough), not a code/file mention
                    const userCandidates = Array.from(turn.querySelectorAll(SEL.user.messageBlock))
                        .filter(el => el.offsetHeight > 30 && el.offsetWidth > 200 
                                   && !el.closest('.context-scope-mention')
                                   && !el.classList.contains('context-scope-mention'));
                    const ue = userCandidates[0];
                    if (ue) {
                        const ut = (ue.innerText || '').trim();
                        if (ut.length > 5) {
                            const k = 'u:' + ut.substring(0, 80);
                            if (!seen.has(k)) { 
                                seen.add(k); 
                                collected.push({ role: 'user', type: 'message', content: ut, html: '' }); 
                            }
                        }
                    }
                    
                    // 2. AGENT Task Blocks (with UI)
                    // We only target .isolate.mb-2, ignoring .isolate (thought blocks)
                    const isos = Array.from(turn.querySelectorAll(SEL.agentTask.taskBlockWithUI));
                    for (const iso of isos) {
                        let taskTitle = '', taskSummary = '', taskStatus = '', mh = '';
                        let allStatuses = [];
                        
                        // A. Extract TaskName (Title)
                        const titleEl = iso.querySelector(SEL.agentTask.title);
                        if (titleEl) taskTitle = (titleEl.innerText || '').trim();
                        
                        // B. Extract TaskSummary (Paragraph)
                        taskSummary = null;
                        mh = '';
                        const summaryEl = iso.querySelector(SEL.agentTask.summaryContent);
                        if (summaryEl) {
                            taskSummary = (summaryEl.innerText || '').trim();
                            // Fix local image URLs in HTML
                            const cl = summaryEl.cloneNode(true);
                            cl.querySelectorAll('img').forEach(img => {
                                const src = img.getAttribute('src');
                                if (src && src.startsWith('/')) img.src = 'http://localhost:9000' + src;
                            });
                            mh = cl.innerHTML || '';
                        }
                        
                        // C. Extract TaskStatus(es) from Progress Updates section
                        const sections = Array.from(iso.querySelectorAll(SEL.agentTask.sectionBorderT));
                        for (const sec of sections) {
                            // Identify Progress Updates section by its header row
                            const headerRow = sec.querySelector(SEL.agentTask.sectionLabelProgress);
                            if (headerRow && (headerRow.innerText || '').includes('Progress')) {
                                // This is definitively the Progress Updates section
                                // TaskStatus lives in sticky headers inside this section
                                const statusHeaders = Array.from(sec.querySelectorAll(SEL.agentTask.statusHeader));
                                for (const sh of statusHeaders) {
                                    const textEl = sh.querySelector(SEL.agentTask.statusText);
                                    if (textEl) {
                                        const st = (textEl.innerText || '').trim();
                                        if (st && st.length > 5 && !/^\d+$/.test(st)) {
                                            allStatuses.push(st);
                                            taskStatus = st; // Most recent step
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (taskTitle || taskSummary || allStatuses.length > 0) {
                            const k = 'tb:' + (taskTitle || '') + ':' + (taskSummary ? taskSummary.substring(0, 80) : allStatuses.join('').substring(0, 80));
                            if (!seen.has(k)) {
                                seen.add(k);
                                collected.push({
                                    role: 'agent',
                                    type: 'taskBlock',
                                    taskTitle: taskTitle || 'Action en cours',
                                    taskStatus: taskStatus,
                                    taskSummary: taskSummary,
                                    allStatuses: allStatuses,
                                    html: mh.substring(0, 30000)
                                });
                            }
                        }
                    }
                    
                    // 3. AGENT Direct Messages (outside task blocks)
                    const dms = Array.from(turn.querySelectorAll(SEL.agent.directMessage))
                        .filter(el => !el.closest(SEL.agent.taskBlock));
                    for (const dm of dms) {
                        const ct = (dm.innerText || '').trim();
                        if (ct.length > 20) {
                            const k = 'dm:' + ct.substring(0, 80);
                            if (!seen.has(k)) { 
                                seen.add(k); 
                                collected.push({ 
                                    role: 'agent', 
                                    type: 'directMessage', 
                                    content: ct, 
                                    html: (dm.innerHTML || '').substring(0, 50000) 
                                }); 
                            }
                        }
                    }

                }
            }
            
            extractVisible();
            // Force scroll to bottom so we never miss messages in Agent Manager
            chatScroll.scrollTop = chatScroll.scrollHeight;

            // Extract available artifacts from sidebar (if visible)
            let availableArtifacts = [];
            let artHeader = null;
            try {
                artHeader = Array.from(document.querySelectorAll(SEL.artifacts.sectionHeader))
                    .find(el => (el.innerText || '').trim() === 'Artifacts' && el.offsetParent !== null);
                if (artHeader) {
                    const container = artHeader.closest('.flex.flex-col') || artHeader.parentElement?.parentElement;
                    if (container) {
                        const ul = container.querySelector('ul');
                        if (ul) {
                            availableArtifacts = Array.from(ul.querySelectorAll('li'))
                                .filter(li => li.offsetParent !== null && (li.innerText || '').trim().length > 1)
                                .map(li => (li.innerText || '').trim());
                        }
                    }
                }
            } catch(e) { /* sidebar not open, ignore */ }

            // Auto-open sidebar if chat is active but artifacts panel not found
            if (!artHeader && chatScroll) {
                try {
                    const toggleBtn = document.querySelector(SEL.artifacts.toggleSidebar);
                    if (toggleBtn && toggleBtn.offsetParent !== null) {
                        const rect = toggleBtn.getBoundingClientRect();
                        const x = rect.left + rect.width / 2;
                        const y = rect.top + rect.height / 2;
                        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                            toggleBtn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
                        });
                    }
                } catch(e) { }
            }

            const cancelBtn = document.querySelector(SEL.controls.cancelButton);
            const isStreaming = !!(cancelBtn && cancelBtn.offsetParent !== null);

            // --- Conversation Finished Detection (green dot on active pill) ---
            let conversationFinished = false;
            try {
                const pills = Array.from(document.querySelectorAll(SEL.history.conversationPill));
                const activePill = pills.find(p => {
                    const btn = p.closest('button');
                    return btn && (btn.classList.contains('bg-ide-editor-background') || btn.classList.contains('bg-ide-element-background') || btn.getAttribute('aria-selected') === 'true');
                });
                if (activePill) {
                    const container = activePill.closest('button');
                    if (container) {
                        const greenDot = container.querySelector('.bg-green-500, .bg-green-400, [class*="bg-green-"]');
                        if (greenDot) conversationFinished = true;
                    }
                }
            } catch(e) { /* sidebar may not be visible */ }

            // --- Auto-Retry Logic ---
            let retryDetected = false;
            const retryBtn = document.querySelector(SEL.controls.retryButton);
            const errorMsgs = Array.from(document.querySelectorAll(SEL.controls.errorMessage));
            const hasTargetError = errorMsgs.some(el => (el.innerText || '').includes('Agent terminated due to error'));
            
            if (retryBtn && hasTargetError) {
                retryDetected = true;
                if (!window.__antigravityRetryPending) {
                    window.__antigravityRetryPending = true;
                    const delay = Math.floor(Math.random() * 2000);
                    console.log(\`[CDP] Error detected. Auto-clicking Retry in \${delay}ms...\`);
                    setTimeout(() => {
                        window.__antigravityRetryPending = false; // Reset flag so it can retry again if it fails
                        const freshBtn = document.querySelector(SEL.controls.retryButton);
                        if (freshBtn) {
                            freshBtn.click();
                            console.log('[CDP] Auto-clicked Retry button.');
                        } else {
                            console.log('[CDP] Auto-retry failed: button disappeared.');
                        }
                    }, delay);
                }
            }

            return { 
                messages: collected, 
                isFull: false, 
                isStreaming,
                conversationFinished,
                availableArtifacts, 
                retryInfo: { detected: retryDetected },
                scrollInfo: { scrollTop: chatScroll.scrollTop, scrollHeight, clientHeight } 
            };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;
    const val = await runCdpScript(cdp, CAPTURE_SCRIPT, 'captureSnapshot');
    if (val && !val.error) return val;
    return null;
}

/**
 * Get available models by reading the model dropdown in Agent Manager
 */
export async function getAvailableModels(cdp) {
    if (!cdp) return [];
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in getAvailableModels()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inputBox;

            // Find the model clickable element inside the controls row
            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in getAvailableModels()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = controlsRow;

            const modelBtn = controlsRow.querySelector(SEL.controls.modelClickable);
            if (!modelBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modelClickable + '" — not found in getAvailableModels()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = modelBtn;

            modelBtn.click();
            await new Promise(r => setTimeout(r, 600));

            // Find the model dialog that appeared
            const dialogs = Array.from(controlsRow.querySelectorAll(SEL.dropdowns.dialog))
                .filter(d => d.offsetWidth > 50 && d.offsetHeight > 50);
            if (dialogs.length === 0) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                throw new Error('[CDP] Selector broken: "' + SEL.dropdowns.dialog + '" — model dialog not found in getAvailableModels()');
            }

            const dialog = dialogs[dialogs.length - 1]; // Last one = model dialog (second in DOM order)
            const modelNames = Array.from(dialog.querySelectorAll(SEL.dropdowns.modelOptionName))
                .map(el => el.textContent.trim())
                .filter(t => t.length > 3);

            // Close dialog
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            document.body.click();
            await new Promise(r => setTimeout(r, 200));

            return { models: [...new Set(modelNames)] };
        } catch(e) { return { models: [], error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value?.models?.length > 0) return res.result.value.models;
        } catch (e) {}
    }
    return [];
}


/**
 * Inject a message into the Agent Manager chat editor
 */
export async function injectMessage(cdp, text) {
    if (!cdp) throw new Error("Not connected to Manager CDP");
    const safeText = JSON.stringify(text);

    const EXPRESSION = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in injectMessage()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inputBox;

            const editor = inputBox.querySelector(SEL.controls.editor);
            if (!editor) throw new Error('[CDP] Selector broken: "' + SEL.controls.editor + '" — not found in injectMessage()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = editor;

            const textToInsert = ${safeText};

            // Focus and clear existing content
            editor.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("delete", false, null);

            // Simple insertText — proven to work reliably in CDP context
            // Note: newlines ARE preserved in the Agent Manager editor with this approach
            document.execCommand("insertText", false, textToInsert);

            // Wait for React editor to process
            await new Promise(r => setTimeout(r, 450));

            const submitBtn = document.querySelector(SEL.controls.submitButton);
            if (submitBtn) {
                submitBtn.click();
                return { ok:true, method: "insertText" };
            }

            // Fallback to Enter key
            editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter" }));
            editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles:true, key:"Enter", code:"Enter" }));

            return { ok:true, method:"enter_keypress" };
        } catch(e) { return { ok:false, error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: EXPRESSION,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (result.result && result.result.value) return result.result.value;
        } catch (e) {}
    }
    return { ok: false, reason: "no_context" };
}

/**
 * Stop AI generation
 */
export async function stopGeneration(cdp) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const cancel = document.querySelector(SEL.controls.cancelButton);
            if (cancel && cancel.offsetParent !== null) {
                cancel.click();
                return { success: true };
            }
            return { error: 'No active generation found' };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'stopGeneration');
}

/**
 * Sync scroll position to desktop
 */
export async function remoteScroll(cdp, deltaY) {
    if (!cdp) return { error: 'Not connected' };
    
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const chatScroll = Array.from(document.querySelectorAll(SEL.chat.scrollContainer))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
                
            if (!chatScroll) throw new Error('[CDP] Selector broken: "' + SEL.chat.scrollContainer + '" — not found in remoteScroll()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = chatScroll;
            
            chatScroll.scrollBy({ top: ${deltaY}, behavior: 'smooth' });
            
            return { 
                success: true, 
                scrollTop: chatScroll.scrollTop, 
                scrollHeight: chatScroll.scrollHeight 
            };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'remoteScroll');
}

/**
 * Set AI mode (Fast/Planning)
 */
export async function setMode(cdp, modeText) {
    if (!cdp) return { error: 'Not connected' };
    if (!['Fast', 'Planning'].includes(modeText)) return { error: 'Invalid mode' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const mode = ${JSON.stringify(modeText)};
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in setMode()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inputBox;

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in setMode()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = controlsRow;

            // Read current mode from the mode button label
            const modeBtn = controlsRow.querySelector(SEL.controls.modeButton);
            if (!modeBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modeButton + '" — not found in setMode()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = modeBtn;

            const currentMode = (modeBtn.innerText || '').trim();
            if (currentMode === mode) return { success: true, alreadySet: true };

            // Click mode button to open dialog
            modeBtn.click();
            await new Promise(r => setTimeout(r, 400));

            // Find the mode dialog
            const dialogs = Array.from(controlsRow.querySelectorAll(SEL.dropdowns.dialog))
                .filter(d => d.offsetWidth > 50 && d.offsetHeight > 20);
            if (dialogs.length === 0) throw new Error('[CDP] Selector broken: "' + SEL.dropdowns.dialog + '" — mode dialog not found in setMode()');

            const dialog = dialogs[0]; // First dialog = mode picker
            const options = Array.from(dialog.querySelectorAll(SEL.dropdowns.modeOption));
            const target = options.find(el => (el.textContent || '').trim() === mode);
            if (!target) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                throw new Error('[CDP] Mode option "' + mode + '" not found in dialog — check SEL.dropdowns.modeOption');
            }

            target.click();
            return { success: true };
        } catch(err) {     return {         error: err.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'setMode');
}

/**
 * Set AI model
 */
export async function setModel(cdp, modelText) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const model = ${JSON.stringify(modelText)};
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in setModel()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inputBox;

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in setModel()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = controlsRow;

            const modelBtn = controlsRow.querySelector(SEL.controls.modelClickable);
            if (!modelBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modelClickable + '" — not found in setModel()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = modelBtn;

            modelBtn.click();
            await new Promise(r => setTimeout(r, 600));

            // Find the model dialog (last dialog in controls row)
            const dialogs = Array.from(controlsRow.querySelectorAll(SEL.dropdowns.dialog))
                .filter(d => d.offsetWidth > 50 && d.offsetHeight > 50);
            if (dialogs.length === 0) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                throw new Error('[CDP] Selector broken: "' + SEL.dropdowns.dialog + '" — model dialog not found in setModel()');
            }

            const dialog = dialogs[dialogs.length - 1]; // Last one = model dialog
            const modelNames = Array.from(dialog.querySelectorAll(SEL.dropdowns.modelOptionName));
            const target = modelNames.find(el => (el.textContent || '').trim() === model)
                        || modelNames.find(el => (el.textContent || '').includes(model));

            if (!target) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                const available = modelNames.map(el => el.textContent.trim()).join(', ');
                return { error: 'Model "' + model + '" not found. Available: ' + available };
            }

            // Click the row containing this model name
            const row = target.closest(SEL.dropdowns.modelOptionRow) || target;
            row.scrollIntoView({block: 'center'});
            row.click();
            return { success: true };
        } catch(err) {     return {         error: err.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'setModel');
}

/**
 * Start a new chat
 */
export async function startNewChat(cdp) {
    if (!cdp) return { error: 'Not connected' };

    // Strategy 1: Use CDP keyboard shortcut Ctrl+Shift+L (native Gemini new chat shortcut)
    try {
        await cdp.call("Input.dispatchKeyEvent", {
            type: "keyDown",
            modifiers: 3, // Ctrl(1) + Shift(2) = 3
            key: "L",
            code: "KeyL",
            windowsVirtualKeyCode: 76,
            nativeVirtualKeyCode: 76
        });
        await cdp.call("Input.dispatchKeyEvent", {
            type: "keyUp",
            modifiers: 3,
            key: "L",
            code: "KeyL",
            windowsVirtualKeyCode: 76,
            nativeVirtualKeyCode: 76
        });

        await new Promise(r => setTimeout(r, 500));
        return { success: true, method: 'keyboard_ctrl_shift_l' };
    } catch (e) {
        console.log('⚠️ Keyboard shortcut failed:', e.message);
    }

    // Strategy 2: DOM click using strict selectors
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            function simulateClick(el) {
                const rect = el.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
                });
            }

            // Try sidebar nav button with "add" icon (Start new conversation)
            const navBtns = Array.from(document.querySelectorAll(SEL.sidebarNav.navButton))
                .filter(d => d.offsetParent !== null);
            const newChatBtn = navBtns.find(btn => {
                const icon = btn.querySelector(SEL.sidebarNav.googleSymbol);
                return icon && icon.textContent.trim() === SEL.sidebarNav.newChatIcon;
            });
            if (newChatBtn) { simulateClick(newChatBtn); return { success: true, method: 'sidebar_new_chat' }; }

            // Try button with title="Edit"
            const editBtn = document.querySelector(SEL.sidebarNav.editButton);
            if (editBtn && editBtn.offsetParent !== null) { simulateClick(editBtn); return { success: true, method: 'edit_button' }; }

            throw new Error('[CDP] New chat button not found — update SEL.sidebarNav selectors');
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'startNewChat');
}

/**
 * Get current App state (mode, model, workspace)
 */
export async function getAppState(cdp) {
    if (!cdp) return { mode: 'Unknown', model: 'Unknown' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const state = { mode: 'Unknown', model: 'Unknown' };
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in getAppState()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = inputBox;

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in getAppState()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = controlsRow;

            // Read mode from the mode button
            const modeBtn = controlsRow.querySelector(SEL.controls.modeButton);
            if (modeBtn) {
                const modeLabel = modeBtn.querySelector(SEL.state.modeLabel);
                state.mode = modeLabel ? modeLabel.textContent.trim() : (modeBtn.innerText || '').trim();
            }

            // Read model from the model label
            const modelLabel = controlsRow.querySelector(SEL.controls.modelLabel);
            if (modelLabel) state.model = modelLabel.textContent.trim();

            // Read workspace from the sidebar section headers
            const wsHeaders = Array.from(document.querySelectorAll(SEL.state.workspaceHeader));
            const activeWs = wsHeaders.find(h => {
                // The active workspace has conversation pills under it
                const section = h.closest('.flex.flex-col');
                return section && section.querySelector('[data-testid^="convo-pill-"]');
            });
            if (activeWs) state.workspace = activeWs.textContent.trim();
const pills=Array.from(document.querySelectorAll(SEL.history.conversationPill));const activePill=pills.find(p=>{const btn=p.closest('button');return btn&&(btn.classList.contains('bg-ide-editor-background')||btn.classList.contains('bg-ide-element-background')||btn.getAttribute('aria-selected')==='true')});if(activePill) state.chatTitle=activePill.textContent.trim();
return state;
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'getAppState');
}

/**
 * Check if chat is open by looking for the input box and chat scroll area
 */
export async function hasChatOpen(cdp) {
    if (!cdp) return { hasChat: false, hasMessages: false, editorFound: false };
    const EXP = `(() => {
        const SEL = ${JSON.stringify(SELECTORS)};
        const inputBox = document.querySelector(SEL.controls.inputBox);
        const editor = inputBox ? inputBox.querySelector(SEL.controls.editor) : null;
        const chatScroll = Array.from(document.querySelectorAll(SEL.chat.scrollContainer))
            .find(el => el.scrollHeight > 100 && el.offsetWidth > 200);
        const hasMessages = chatScroll ? chatScroll.scrollHeight > 300 : false;
        return { hasChat: !!inputBox, hasMessages, editorFound: !!editor };
    })()`;

    return await runCdpScript(cdp, EXP, 'hasChatOpen');
}

/**
 * Click a remote element by CSS selector and index
 * Note: This function accepts the selector from the caller (used by /remote-click route).
 * No innerText filtering — only CSS selector targeting.
 */
export async function clickElement(cdp, { selector, index }) {
    if (!cdp) return { error: 'Not connected' };
    const safeSelector = JSON.stringify(selector);
    const EXP = `(async () => {
        try {
            let lastValidRoot = document.body;
            const sel = ${safeSelector};
            const elements = Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
            if (elements.length === 0) throw new Error('[CDP] Selector "' + sel + '" returned 0 visible elements in clickElement()');
            const target = elements[${index || 0}];
            if (!target) throw new Error('[CDP] Element at index ${index || 0} not found for selector "' + sel + '" (' + elements.length + ' total)');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = target;
            target.focus?.();
            target.click();
            return { success: true, found: elements.length, indexUsed: ${index || 0} };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'clickElement');
}

/**
 * Get chat history from the Agent Manager sidebar
 */
export async function getChatHistory(cdp) {
    if (!cdp) throw new Error("Agent Manager not connected");
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = cdp;

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            let pills = document.querySelectorAll(SEL.history.conversationPill);

            // If sidebar not open, click the history button
            if (pills.length === 0) {
                const navBtns = Array.from(document.querySelectorAll(SEL.sidebarNav.navButton))
                    .filter(d => d.offsetParent !== null);
                const historyBtn = navBtns.find(btn => {
                    const icon = btn.querySelector(SEL.sidebarNav.googleSymbol);
                    return icon && icon.textContent.trim() === SEL.sidebarNav.historyIcon;
                });
                if (!historyBtn) throw new Error('[CDP] Selector broken: history button not found — check SEL.sidebarNav');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = historyBtn;

                historyBtn.click();
                await new Promise(r => setTimeout(r, 1500));
                pills = document.querySelectorAll(SEL.history.conversationPill);
            }

            const chats = [];

            pills.forEach(pill => {
                const title = pill.textContent?.trim() || '';
                const id = pill.getAttribute('data-testid')?.replace('convo-pill-', '') || '';
                const container = pill.closest('button');
                let time = '';
                let isActive = false;

                if (container) {
                    const timeSpans = Array.from(container.querySelectorAll(SEL.history.timeLabel));
                    const timeSpan = timeSpans.find(s => {
                        const t = s.textContent?.trim();
                        return t && (t === 'now' || /\\d+[mhdw]/.test(t));
                    });
                    if (timeSpan) time = timeSpan.textContent.trim();
                    container.querySelectorAll(SEL.history.activeSpinner).forEach(icon => {
                        if (icon.textContent?.trim() === 'progress_activity') isActive = true;
                    });
                }

                let isFinished=false;if(container){const greenDot=container.querySelector('.bg-green-500, .bg-green-400, [class*="bg-green-"]');if(greenDot)isFinished=true;}let workspace='Other';
                const section = pill.closest(SEL.history.sectionContainer);
                if (section) {
                    const header = section.querySelector(SEL.history.sectionHeader);
                    if (header) workspace = header.textContent.trim();
                }

                if (title.length > 2) {
                    chats.push({title,id,time:time||'Recent',isActive,isFinished,workspace});
                }
            });

            return { success: true, chats };
        } catch(e) {     return {         error: e.toString(), chats: [] ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'getChatHistory');
}

/**
 * List workspaces/projects from Agent Manager sidebar
 */
export async function listProjects(cdp) {
    if (!cdp) throw new Error("Agent Manager not connected");
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = cdp;

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            // Open workspace dialog using the known button
            const btn = document.querySelector(SEL.sidebar.openWorkspaceButton);
            if (!btn) throw new Error('[CDP] Selector broken: "' + SEL.sidebar.openWorkspaceButton + '" — not found in listProjects()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = btn;

            btn.click();
            await new Promise(r => setTimeout(r, 600));

            // Read workspace items from the dropdown
            const items = Array.from(document.querySelectorAll(SEL.sidebar.workspaceListItems));
            if (items.length === 0) {
                document.body.click();
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                throw new Error('[CDP] Selector broken: "' + SEL.sidebar.workspaceListItems + '" — dropdown empty in listProjects()');
            }

            const projects = [];
            items.forEach((item, index) => {
                const nameNode = item.querySelector(SEL.sidebar.workspaceItemName);
                const name = nameNode ? nameNode.innerText.trim() : '';
                if (name && name.length > 1 && !projects.some(p => p.name === name)) {
                    const pathNode = item.querySelector(SEL.sidebar.workspaceItemPath);
                    projects.push({ name, path: pathNode ? pathNode.innerText.trim() : 'Workspace ' + (index + 1), index });
                }
            });

            // Close dropdown
            document.body.click();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            return { success: true, projects };
        } catch(err) {     return {         error: err.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (result.result?.value?.success) return result.result.value.projects;
        } catch (e) {}
    }
    return [];
}

/**
 * Open a specific project from Agent Manager
 */
export async function openProject(cdp, { index, name }) {
    if (!cdp) throw new Error("Agent Manager not connected");
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = cdp;

    const projectName = name;
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const targetName = ${JSON.stringify(projectName)};

            // 1. Open the Workspace menu
            const btn = document.querySelector(SEL.sidebar.openWorkspaceButton);
            if (!btn) throw new Error('[CDP] Selector broken: "' + SEL.sidebar.openWorkspaceButton + '" — not found in openProject()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = btn;

            btn.click();
            await new Promise(r => setTimeout(r, 600));

            // 2. Find the matching item
            const items = Array.from(document.querySelectorAll(SEL.sidebar.workspaceListItems));
            if (items.length === 0) {
                 document.body.click();
                 throw new Error('[CDP] Selector broken: "' + SEL.sidebar.workspaceListItems + '" — menu empty in openProject()');
            }

            const targetItem = items.find(el => {
                const nameNode = el.querySelector(SEL.sidebar.workspaceItemName);
                return nameNode && nameNode.innerText.trim() === targetName;
            });

            if (!targetItem) {
                document.body.click();
                return { success: false, error: "Project '"+targetName+"' not found in dropdown list." };
            }

            // 3. Click the project
            targetItem.click();

            return { success: true, message: "Opening project..." };
        } catch (error) {
            return { success: false, error: error.toString() };
        }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (result.result?.value?.success) return true;
        } catch (e) {}
    }
    return false;
}

/**
 * Select a specific chat by title from Manager
 */
export async function selectChat(cdp, chatTitle) {
    if (!cdp) throw new Error("Agent Manager not connected");
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = cdp;
    const safeChatTitle = JSON.stringify(chatTitle);

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const targetTitle = ${safeChatTitle};

            let pills = document.querySelectorAll(SEL.history.conversationPill);

            // If sidebar not open, click the history button
            if (pills.length === 0) {
                const navBtns = Array.from(document.querySelectorAll(SEL.sidebarNav.navButton))
                    .filter(d => d.offsetParent !== null);
                const historyBtn = navBtns.find(btn => {
                    const icon = btn.querySelector(SEL.sidebarNav.googleSymbol);
                    return icon && icon.textContent.trim() === SEL.sidebarNav.historyIcon;
                });
                if (historyBtn) {
                    historyBtn.click();
                    await new Promise(r => setTimeout(r, 800));
                    pills = document.querySelectorAll(SEL.history.conversationPill);
                }
            }
            let targetPill = null;

            for (const pill of pills) {
                if (pill.textContent?.trim() === targetTitle) {
                    targetPill = pill;
                    break;
                }
            }

            if (targetPill) {
                targetPill.click();
                return { success: true };
            }

            return { error: 'Chat "' + targetTitle + '" not found in ' + pills.length + ' pills' };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'selectChat');
}

/**
 * Trigger the "/" or "@" picker by typing the character into the editor.
 * Auto-navigates to the relevant sub-menu (Workflows for "/", Mentions for "@")
 * and returns the list of sub-items directly.
 * @param {Object} cdp CDP connection
 * @param {string} char The trigger character ("/" or "@")
 */
export async function triggerPicker(cdp, char) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) return { error: 'No CDP connection' };
    if (char !== '/' && char !== '@') return { error: 'Invalid trigger char, must be "/" or "@"' };

    const safeChar = JSON.stringify(char);
    // "/" → click "Workflows" (index 2), "@" → click "Mentions" (index 1)
    const targetIndex = char === '/' ? 2 : 1;

    const EXPRESSION = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const editor = document.querySelector(SEL.controls.editor);
            if (!editor) throw new Error('[CDP] Selector broken: "' + SEL.controls.editor + '" \u2014 not found in triggerPicker()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = editor;

            editor.focus();
            // Clear existing content
            document.execCommand("selectAll", false, null);
            document.execCommand("delete", false, null);
            await new Promise(r => setTimeout(r, 100));

            // Insert trigger char via execCommand
            document.execCommand("insertText", false, ${safeChar});

            // The UI directly shows the workflow/mentions list for '/' or '@'
            // No category dialog intermediate step anymore.
            let items = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(r => setTimeout(r, 200));

                const workflowList = document.querySelector(SEL.picker.workflowList);
                if (workflowList) {
                    const options = workflowList.querySelectorAll(':scope > div, [role="option"]');
                    if (options.length > 0) {
                        const found = [];
                        Array.from(options).forEach((child, i) => {
                            const text = child.innerText?.trim() || '';
                            if (text) found.push({ index: found.length, label: text, domIndex: i });
                        });
                        if (found.length > 0) { items = { ok: true, type: 'workflow', items: found }; break; }
                    }
                }
            }

            if (!items) {
                throw new Error('[CDP] Selector broken: "' + SEL.picker.workflowList + '" \u2014 workflow list not found or empty after 6 attempts in triggerPicker()');
            }

            return items;

        } catch(e) {
            return { 
                error: e.message, 
                domDump: document.body.innerHTML,
                lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML : ''
            };
        }
    })()`;

    return await runCdpScript(cdp, EXPRESSION, 'triggerPicker');
}

/**
 * Select an option from the visible picker dialog by index.
 * After selection, waits and captures any secondary list (typeahead).
 * @param {Object} cdp CDP connection
 * @param {number} index Index of the option to click
 */
export async function selectPickerOption(cdp, index) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) return { error: 'No CDP connection' };

    const EXPRESSION = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};

        const dialogs = Array.from(document.querySelectorAll(SEL.picker.dialog));
        if (dialogs.length === 0) throw new Error('[CDP] Selector broken: "' + SEL.picker.dialog + '" — picker not visible in selectPickerOption()');
        const dialog = dialogs[dialogs.length - 1];

        const optionEls = dialog.querySelectorAll(SEL.picker.options);
        const target = optionEls[${Number(index)}];
        if (!target) throw new Error('[CDP] Option index ${index} not found in selectPickerOption(). Only ' + optionEls.length + ' options available.');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = target;

        target.click();
        await new Promise(r => setTimeout(r, 1500));

        // Check for typeahead list (secondary options)
        const typeahead = document.querySelector(SEL.picker.typeaheadList);
        if (typeahead && typeahead.children.length > 0) {
            const items = Array.from(typeahead.children).map((el, i) => ({
                index: i,
                label: el.innerText?.trim() || '',
                html: el.outerHTML.substring(0, 500)
            }));
            return { ok: true, type: 'typeahead', items };
        }

        const newDialogs = Array.from(document.querySelectorAll(SEL.picker.dialog));
        const newDialog = newDialogs.length > 0 ? newDialogs[newDialogs.length - 1] : null;
        if (newDialog && newDialog !== dialog) {
            const newOpts = newDialog.querySelectorAll(SEL.picker.options);
            const items = Array.from(newOpts).map((el, i) => ({
                index: i,
                label: el.innerText?.trim() || '',
            }));
            return { ok: true, type: 'dialog', items };
        }

        return { ok: true, type: 'direct', items: [] };
    })()`;

    return await runCdpScript(cdp, EXPRESSION, 'selectPickerOption');
}

/**
 * Select an item from the typeahead list by index, then submit.
 * @param {Object} cdp CDP connection
 * @param {number} index Index of the typeahead item to click
 */
export async function selectTypeaheadItem(cdp, index) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) return { error: 'No CDP connection' };

    const EXPRESSION = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        let lastValidRoot = document.body;
        try {
            const typeahead = document.querySelector(SEL.picker.typeaheadList);
            if (!typeahead) throw new Error('[CDP] Selector broken: "' + SEL.picker.typeaheadList + '" \u2014 not found in selectTypeaheadItem()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = typeahead;

            const items = typeahead.children;
            if (${Number(index)} >= items.length) throw new Error('[CDP] Typeahead index ${index} out of range. Only ' + items.length + ' items.');

            items[${Number(index)}].click();
            await new Promise(r => setTimeout(r, 500));

            return { ok: true };
        } catch(e) {
            return { error: e.message, domDump: document.body.innerHTML, lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML : '' };
        }
    })()`;

    return await runCdpScript(cdp, EXPRESSION, 'selectTypeaheadItem');
}

/**
 * Select a workflow item from the workflow list overlay by DOM child index.
 * @param {Object} cdp CDP connection
 * @param {number} domIndex DOM child index in the workflow list overlay
 */
export async function selectWorkflowItem(cdp, domIndex) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) return { error: 'No CDP connection' };

    const EXPRESSION = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};

        let workflowList = document.querySelector(SEL.picker.workflowList);
        
        // If the workflow list is closed (Typeahead lost focus), we need to re-open it
        if (!workflowList || workflowList.children.length === 0) {
            const editor = document.querySelector(SEL.controls.editor);
            if (!editor) throw new Error('[CDP] Editor not found');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = editor;
            
            editor.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("delete", false, null);
            await new Promise(r => setTimeout(r, 100));
            document.execCommand("insertText", false, "/");
            
            // Wait for overlays
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 200));
                workflowList = document.querySelector(SEL.picker.workflowList);
                if (workflowList && workflowList.children.length > 0) break;
            }
        }

        if (!workflowList) throw new Error('[CDP] Selector broken: "' + SEL.picker.workflowList + '" — not found after retry in selectWorkflowItem()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = workflowList;

        const wrapper = workflowList.children[${Number(domIndex)}];
        if (!wrapper) throw new Error('[CDP] Workflow domIndex ${domIndex} not found in selectWorkflowItem(). Only ' + workflowList.children.length + ' children.');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = wrapper;

        // The wrapper <div> has no click handler — the actual clickable element
        // is the inner <div class="cursor-pointer">
        const target = wrapper.querySelector('.cursor-pointer') || wrapper;
        target.click();
        await new Promise(r => setTimeout(r, 500));

        return { ok: true };
    })()`;

    return await runCdpScript(cdp, EXPRESSION, 'selectWorkflowItem');
}

/**
 * List artifacts from the Agent Manager aux sidebar
 * Opens the changes panel if not already open, extracts artifact names
 */
export async function listArtifacts(cdp) {
    if (!cdp) return { error: 'Not connected', artifacts: [] };

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            // 1. Ensure the aux sidebar is open
            const toggleBtn = document.querySelector(SEL.artifacts.toggleSidebar);
            if (!toggleBtn) throw new Error('[CDP] Selector broken: "' + SEL.artifacts.toggleSidebar + '" — not found in listArtifacts()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = toggleBtn;

            // Check if sidebar is already visible by looking for the sidebar panel content
            const sidebarContent = document.querySelector('.px-3.pb-2.flex.h-full.w-full.flex-col.gap-4');
            if (!sidebarContent || sidebarContent.offsetWidth < 100) {
                toggleBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }

            // 2. Find the "Artifacts" header by its exact own-text (not innerText which includes children)
            const allDivs = Array.from(document.querySelectorAll('div'));
            const artifactHeader = allDivs.find(d => {
                const ownText = Array.from(d.childNodes)
                    .filter(n => n.nodeType === 3)
                    .map(n => n.textContent.trim())
                    .join(' ');
                return ownText === 'Artifacts' && d.offsetParent !== null;
            });
            
            if (!artifactHeader) return { artifacts: [], error: 'Artifacts header not found in sidebar' };

            // 3. The artifact list is the UL sibling of the header's parent
            // Structure: parent(.flex.items-center.gap-1.select-none) > [div "Artifacts", span "info"]
            // Sibling UL: ul.mt-2.space-y-1 containing the actual artifact items
            const headerRow = artifactHeader.parentElement; // .flex.items-center.gap-1.select-none
            const artifactList = headerRow?.nextElementSibling; // UL.mt-2.space-y-1

            if (!artifactList || artifactList.tagName !== 'UL') {
                return { artifacts: [], error: 'Artifact UL not found as sibling of header row' };
            }

            // 4. Extract LI items from the UL
            const listItems = Array.from(artifactList.querySelectorAll('li'));
            const artifacts = listItems
                .filter(li => li.offsetParent !== null && li.innerText?.trim().length > 1)
                .map(li => ({
                    name: li.innerText?.trim(),
                    isClickable: true,
                }));

            return { artifacts };
        } catch(e) {     return {         error: e.toString(), artifacts: [] ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'listArtifacts');
}

/**
 * Get the content of a specific artifact by clicking on it and extracting rendered markdown
 * @param {Object} cdp CDP connection
 * @param {string} name Artifact name (e.g. "Implementation Plan", "Task", "Walkthrough")
 */
export async function getArtifactContent(cdp, name) {
    if (!cdp) return { error: 'Not connected' };
    const safeName = JSON.stringify(name);

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            let lastValidRoot = document.body;
            const targetName = ${safeName};

            // 1. Ensure sidebar is open
            const toggleBtn = document.querySelector(SEL.artifacts.toggleSidebar);
            if (!toggleBtn) throw new Error('[CDP] Selector broken: "' + SEL.artifacts.toggleSidebar + '" — not found in getArtifactContent()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = toggleBtn;

            const sidebarContent = document.querySelector('.px-3.pb-2.flex.h-full.w-full.flex-col.gap-4');
            if (!sidebarContent || sidebarContent.offsetWidth < 100) {
                toggleBtn.click();
                await new Promise(r => setTimeout(r, 1000));
            }

            // 2. Find and click the artifact by name
            const allEls = Array.from(document.querySelectorAll('*'))
                .filter(el => el.offsetParent !== null && el.innerText?.trim() === targetName
                    && el.children.length === 0);

            const clickTarget = allEls.find(el =>
                getComputedStyle(el).cursor === 'pointer'
                || getComputedStyle(el.parentElement).cursor === 'pointer'
            ) || allEls[allEls.length - 1];

            if (!clickTarget) return { error: 'Artifact "' + targetName + '" not found in sidebar' };

            // Click the clickable parent if needed
            const actualTarget = getComputedStyle(clickTarget).cursor === 'pointer'
                ? clickTarget
                : clickTarget.parentElement;
            actualTarget.click();

            // 3. Wait for the viewer to render
            await new Promise(r => setTimeout(r, 2000));

            // 4. Find the viewer content (largest leading-relaxed select-text)
            const viewers = Array.from(document.querySelectorAll('div'))
                .filter(d => {
                    const cls = d.className || '';
                    return cls.includes('leading-relaxed') && cls.includes('select-text')
                        && d.offsetWidth > 200 && (d.innerText?.length || 0) > 50;
                })
                .sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0));

            const viewer = viewers[0];
            if (!viewer) return { error: 'Viewer content not found after clicking artifact' };

            // 5. Extract content
            const content = viewer.innerText || '';
            const html = viewer.innerHTML || '';

            // 6. Extract viewer header info (title, timestamp)
            let headerInfo = {};
            const artPanel = viewer.closest('.flex.w-full.h-full.outline-none.flex-col');
            if (artPanel && artPanel.children.length >= 2) {
                const header = artPanel.children[0];
                headerInfo.headerText = header?.innerText?.substring(0, 200);

                // Check for Proceed button
                const proceedBtn = Array.from(artPanel.querySelectorAll('button'))
                    .find(b => b.innerText?.trim() === 'Proceed');
                headerInfo.hasProceed = !!proceedBtn;

                // Check for Review button
                const reviewBtn = artPanel.querySelector('button[aria-haspopup="dialog"]');
                headerInfo.hasReview = !!reviewBtn;
            }

            return {
                name: targetName,
                content: content.substring(0, 50000),
                html: html.substring(0, 100000),
                ...headerInfo,
            };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'getArtifactContent');
}


/**
 * Add a contextual comment on selected text within an artifact via CDP
 * Selects the target text in the viewer, triggers the native "Comment" button,
 * types in the floating comment dialog, and clicks "Add Comment"
 * @param {Object} cdp CDP connection
 * @param {Object} params { artifactName, selectedText, comment }
 */
export async function addContextualComment(cdp, { artifactName, selectedText, comment }) {
    if (!cdp) return { error: 'Not connected' };
    const safeSelectedText = JSON.stringify(selectedText);
    const safeComment = JSON.stringify(comment);

    const EXP = `(async () => {
        try {
            // 1. Find the artifact viewer panel (should be open from getArtifactContent)
            const viewers = Array.from(document.querySelectorAll('div'))
                .filter(d => {
                    const cls = d.className || '';
                    return cls.includes('leading-relaxed') && cls.includes('select-text')
                        && d.offsetWidth > 200 && (d.innerText?.length || 0) > 50;
                })
                .sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0));
            const viewer = viewers[0];
            if (!viewer) return { error: 'Artifact viewer not open. Call getArtifactContent first.' };

            // 2. Find target text and select it via Range/Selection API
            const targetText = ${safeSelectedText};
            
            function findTextNode(root, searchText) {
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                let node;
                while (node = walker.nextNode()) {
                    const idx = node.textContent.indexOf(searchText);
                    if (idx !== -1) return { node, offset: idx };
                }
                // Cross-node: count characters to find range
                const allText = root.innerText || '';
                const pos = allText.indexOf(searchText);
                if (pos === -1) return null;
                let charCount = 0;
                let startNode = null, startOffset = 0, endNode = null, endOffset = 0;
                const w2 = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                while (node = w2.nextNode()) {
                    const len = node.textContent.length;
                    if (!startNode && charCount + len > pos) {
                        startNode = node;
                        startOffset = pos - charCount;
                    }
                    if (startNode && charCount + len >= pos + searchText.length) {
                        endNode = node;
                        endOffset = pos + searchText.length - charCount;
                        break;
                    }
                    charCount += len;
                }
                if (startNode && endNode) return { startNode, startOffset, endNode, endOffset, multiNode: true };
                return null;
            }

            const match = findTextNode(viewer, targetText);
            if (!match) return { error: 'Selected text not found in viewer: "' + targetText.substring(0, 50) + '"' };

            const range = document.createRange();
            if (match.multiNode) {
                range.setStart(match.startNode, match.startOffset);
                range.setEnd(match.endNode, match.endOffset);
            } else {
                range.setStart(match.node, match.offset);
                range.setEnd(match.node, match.offset + targetText.length);
            }
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            // 3. Dispatch mouseup to trigger the "Comment" floating button
            const rect = range.getBoundingClientRect();
            viewer.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
            }));
            await new Promise(r => setTimeout(r, 800));

            // 4. Click the "Comment" button
            let commentBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.offsetParent !== null && b.offsetWidth > 0
                    && (b.innerText?.trim() === 'Comment' || b.innerText?.trim() === 'Comment on this line'));
            
            if (!commentBtn) {
                // Retry with pointerup
                viewer.dispatchEvent(new PointerEvent('pointerup', {
                    bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top,
                }));
                await new Promise(r => setTimeout(r, 800));
                commentBtn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.offsetParent !== null && (b.innerText?.trim() === 'Comment' || b.innerText?.trim() === 'Comment on this line'));
            }

            if (commentBtn) {
                commentBtn.click();
                await new Promise(r => setTimeout(r, 800));
            }

            // 5. Find the floating comment dialog
            const floatingDialog = Array.from(document.querySelectorAll('div'))
                .find(d => {
                    const cls = d.className || '';
                    return cls.includes('absolute') && cls.includes('z-50')
                        && cls.includes('shadow-xl') && d.offsetWidth > 200
                        && d.querySelector('[contenteditable="true"][data-lexical-editor="true"]');
                });
            if (!floatingDialog) return { error: 'Comment dialog not found after text selection.' };

            const editor = floatingDialog.querySelector('[contenteditable="true"][data-lexical-editor="true"]');
            if (!editor) return { error: 'Comment editor not found in dialog' };

            // 6. Type the comment
            editor.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("delete", false, null);
            await new Promise(r => setTimeout(r, 100));

            const commentText = ${safeComment};
            const lines = commentText.split('\
');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > 0) document.execCommand("insertText", false, lines[i]);
                if (i < lines.length - 1) document.execCommand("insertLineBreak");
            }
            await new Promise(r => setTimeout(r, 300));

            // 7. Click "Add Comment"
            const addBtn = Array.from(floatingDialog.querySelectorAll('button'))
                .find(b => b.innerText?.trim() === 'Add Comment' && b.offsetParent !== null);
            if (!addBtn) return { error: '"Add Comment" button not found' };
            addBtn.click();
            await new Promise(r => setTimeout(r, 500));

            return { success: true };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'addContextualComment');
}

/**
 * Click the "Proceed" button inside the artifact viewer
 * @param {Object} cdp CDP connection
 */
export async function proceedArtifact(cdp) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const artPanel = document.querySelector(SEL.artifacts.viewerPanel);
            if (!artPanel) throw new Error('[CDP] Selector broken: "' + SEL.artifacts.viewerPanel + '" — not found in proceedArtifact()');
            if(typeof lastValidRoot !== 'undefined') lastValidRoot = artPanel;

            // Find the Proceed button within the viewer
            const proceedBtn = Array.from(artPanel.querySelectorAll('button'))
                .find(b => b.innerText?.trim() === 'Proceed' && b.offsetParent !== null);
                
            if (!proceedBtn) return { error: 'Proceed button not found in artifact viewer. It may have already been clicked or is not available.' };
            
            proceedBtn.click();
            return { success: true };
        } catch(e) {     return {         error: e.toString() ,         domDump: document.documentElement ? document.documentElement.outerHTML : '',        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''    }; }
    })()`;

    return await runCdpScript(cdp, EXP, 'proceedArtifact');
}

/**
 * Manually trigger the retry button if present (exposed utility)
 */
export async function manualRetry(cdp) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const retryBtn = document.querySelector(SEL.controls.retryButton);
            if (retryBtn && retryBtn.offsetParent !== null) {
                retryBtn.click();
                return { success: true };
            }
            return { error: 'Retry button not found' };
        } catch(e) { return { error: e.toString() }; }
    })()`;
    return await runCdpScript(cdp, EXP, 'manualRetry');
}

/**
 * Automatically clicks the retry button if present, with a delay and retry mechanism.
 * This is intended to be called within other CDP scripts (e.g., captureSnapshot)
 * to handle transient UI states where a retry button might appear.
 * @param {Object} cdp CDP connection
 * @param {number} [retries=3] Number of times to check for the button
 * @param {number} [delayMs=1000] Delay between retries in milliseconds
 */
export async function autoClickRetry(cdp, retries = 3, delayMs = 1000) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async (retries, delayMs) => {
        const SEL = ${JSON.stringify(SELECTORS)};
        for (let i = 0; i < retries; i++) {
            const retryBtn = document.querySelector(SEL.controls.retryButton);
            if (retryBtn && retryBtn.offsetParent !== null) {
                retryBtn.click();
                return { success: true, message: 'Retry button clicked' };
            }
            await new Promise(r => setTimeout(r, delayMs));
        }
        return { success: false, message: 'Retry button not found after multiple attempts' };
    })(${retries}, ${delayMs})`;
    return await runCdpScript(cdp, EXP, 'autoClickRetry');
}
