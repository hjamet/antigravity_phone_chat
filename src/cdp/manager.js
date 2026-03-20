/**
 * CDP Scripts and helpers specifically for the Antigravity Agent Manager (formerly Launchpad)
 * This is now the primary target for chat interactions, snapshots, and project management.
 */

import { SELECTORS } from '../config/selectors.js';

/**
 * Capture a snapshot of the current chat UI from the Manager
 */
export async function captureSnapshot(cdp, options = { fullScroll: false }) {
    if (!cdp) return null;

    const CAPTURE_SCRIPT = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const chatScroll = Array.from(document.querySelectorAll(SEL.chat.scrollContainer))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            
            if (!chatScroll) throw new Error('[CDP] Selector broken: SEL.chat.scrollContainer — chat scroll area not found');
            
            const originalScroll = chatScroll.scrollTop;
            const scrollHeight = chatScroll.scrollHeight;
            const clientHeight = chatScroll.clientHeight;
            const wrapper = chatScroll.children[0];
            if (!wrapper) throw new Error('[CDP] Chat wrapper not found');
            
            const inner = wrapper.children[0];
            if (!inner) throw new Error('[CDP] Chat inner div not found');
            
            const turnsDiv = inner.querySelector(SEL.chat.turnsContainer) || inner;
            
            const collected = [];
            const seen = new Set();
            
            function extractVisible() {
                const turns = Array.from(turnsDiv.children);
                for (const turn of turns) {
                    // 1. USER Messages
                    const ue = turn.querySelector(SEL.user.messageBlock);
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
                        const header = iso.querySelector(SEL.agentTask.headerWrapper);
                        if (header) {
                            const summaryEl = header.querySelector(SEL.agentTask.summaryContent);
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
                        }
                        
                        // C. Extract TaskStatus(es) from Progress Updates section
                        const sections = Array.from(iso.querySelectorAll(SEL.agentTask.sectionBorderT));
                        for (const sec of sections) {
                            const labelEl = sec.querySelector(SEL.agentTask.sectionLabelProgress);
                            if (labelEl) {
                                // This is definitively the Progress Updates section
                                const scrollable = sec.querySelector(SEL.agentTask.progressScrollable);
                                if (scrollable) {
                                    // Steps have sticky headers containing TaskStatus
                                    const statusHeaders = Array.from(scrollable.querySelectorAll(SEL.agentTask.statusHeader));
                                    for (const sh of statusHeaders) {
                                        const textEl = sh.querySelector(SEL.agentTask.statusText);
                                        if (textEl) {
                                            const st = (textEl.innerText || '').trim();
                                            // Check against numbers (like "1", "2") often present in these headers
                                            if (st && st.length > 5 && !/^\\d+$/.test(st)) {
                                                allStatuses.push(st);
                                                taskStatus = st; // Most recent step
                                            }
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
            const isStreaming = wrapper ? !!wrapper.querySelector(SEL.chat.streamingIndicator) : false;
            return { messages: collected, isFull: false, isStreaming, scrollInfo: { scrollTop: chatScroll.scrollTop, scrollHeight, clientHeight } };
        } catch(e) { return { error: e.toString() }; }
    })()`;
    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: CAPTURE_SCRIPT,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });

            if (result.exceptionDetails) {
                console.error("[CDP Script Exception]", result.exceptionDetails.exception?.description || result.exceptionDetails);
                continue;
            }

            if (result.result && result.result.value && !result.result.value.error) {
                return result.result.value;
            } else if (result.result?.value?.error) {
                console.error("[CDP Error]", result.result.value.error);
            }
        } catch (e) {
            console.error("[CDP Exception]", e);
        }
    }
    return null;
}

/**
 * Get available models by reading the model dropdown in Agent Manager
 */
export async function getAvailableModels(cdp) {
    if (!cdp) return [];
    const EXP = `(async () => {
        try {
            // Find model button (contains model name like "Claude", "Gemini", "GPT")
            const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
            if (!inputBox) return { models: [] };
            
            const parent = inputBox.parentElement?.parentElement?.parentElement;
            if (!parent) return { models: [] };
            
            const KNOWN = ["Claude", "Gemini", "GPT"];
            const modelBtns = Array.from(parent.querySelectorAll('button'))
                .filter(b => KNOWN.some(k => (b.innerText || '').includes(k)));
            
            if (modelBtns.length === 0) return { models: [] };
            
            const modelBtn = modelBtns[0];
            modelBtn.click();
            await new Promise(r => setTimeout(r, 600));
            
            // Find the opened dropdown/dialog
            let models = [];
            const allDivs = Array.from(document.querySelectorAll('div'))
                .filter(d => d.offsetHeight > 50 && d.offsetWidth > 100);
            
            // Look for the popover/menu that appeared AFTER clicking
            for (const div of allDivs) {
                const style = window.getComputedStyle(div);
                if (style.position === 'fixed' || style.position === 'absolute') {
                    const items = Array.from(div.querySelectorAll('*'))
                        .filter(el => {
                            const txt = (el.innerText || '').trim();
                            return el.children.length === 0 && txt.length > 3 && txt.length < 60 &&
                                   KNOWN.some(k => txt.includes(k));
                        })
                        .map(el => el.innerText.trim());
                    if (items.length > 0) {
                        models = [...new Set(items)];
                        break;
                    }
                }
            }
            
            // Close by pressing Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            // Also try clicking elsewhere
            document.body.click();
            await new Promise(r => setTimeout(r, 200));
            
            return { models };
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
        const cancel = document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (cancel && cancel.offsetParent !== null) return { ok:false, reason:"busy" };

        const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
        const editor = inputBox?.querySelector('[contenteditable="true"]') || 
                       document.querySelector('[contenteditable="true"][role="textbox"]');
        if (!editor) return { ok:false, error:"editor_not_found" };

        const textToInsert = ${safeText};

        editor.focus();
        document.execCommand?.("selectAll", false, null);
        document.execCommand?.("delete", false, null);

        let inserted = false;
        try { inserted = !!document.execCommand?.("insertText", false, textToInsert); } catch {}
        if (!inserted) {
            editor.textContent = textToInsert;
            editor.dispatchEvent(new InputEvent("beforeinput", { bubbles:true, inputType:"insertText", data: textToInsert }));
            editor.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertText", data: textToInsert }));
        }

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const submit = document.querySelector("svg.lucide-arrow-right")?.closest("button");
        if (submit && !submit.disabled) {
            submit.click();
            return { ok:true, method:"click_submit" };
        }

        editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Enter", code:"Enter" }));
        editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles:true, key:"Enter", code:"Enter" }));
        
        return { ok:true, method:"enter_keypress" };
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
        const cancel = document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (cancel && cancel.offsetParent !== null) {
            cancel.click();
            return { success: true };
        }
        const stopBtn = document.querySelector('button svg.lucide-square')?.closest('button');
        if (stopBtn && stopBtn.offsetParent !== null) {
            stopBtn.click();
            return { success: true, method: 'fallback_square' };
        }
        return { error: 'No active generation found' };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Context failed' };
}

/**
 * Sync scroll position to desktop
 */
export async function remoteScroll(cdp, deltaY) {
    if (!cdp) return { error: 'Not connected' };
    
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const chatScroll = Array.from(document.querySelectorAll(SEL.chat.scrollContainer))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
                
            if (!chatScroll) return { error: 'No scroll container found' };
            
            chatScroll.scrollBy({ top: ${deltaY}, behavior: 'smooth' });
            
            return { 
                success: true, 
                scrollTop: chatScroll.scrollTop, 
                scrollHeight: chatScroll.scrollHeight 
            };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Scroll failed' };
}

/**
 * Set AI mode (Fast/Planning)
 */
export async function setMode(cdp, modeText) {
    if (!cdp) return { error: 'Not connected' };
    if (!['Fast', 'Planning'].includes(modeText)) return { error: 'Invalid mode' };
    const EXP = `(async () => {
        try {
            const mode = ${JSON.stringify(modeText)};
            const allEls = Array.from(document.querySelectorAll('*'));
            const candidates = allEls.filter(el => el.children.length === 0 && (el.textContent.trim() === 'Fast' || el.textContent.trim() === 'Planning'));
            let modeBtn = null;
            for (const el of candidates) {
                let current = el;
                for (let i = 0; i < 4; i++) {
                    if (!current) break;
                    if (window.getComputedStyle(current).cursor === 'pointer' || current.tagName === 'BUTTON') {
                        modeBtn = current; break;
                    }
                    current = current.parentElement;
                }
                if (modeBtn) break;
            }
            if (!modeBtn) return { error: 'Button not found' };
            if (modeBtn.innerText.includes(mode)) return { success: true, alreadySet: true };
            modeBtn.click();
            await new Promise(r => setTimeout(r, 600));
            let dialog = Array.from(document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper], div'))
                .find(d => d.offsetHeight > 0 && d.innerText.includes(mode) && !d.innerText.includes('Files'));
            if (!dialog) return { error: 'Dialog not found' };
            const target = Array.from(dialog.querySelectorAll('*')).find(el => el.children.length === 0 && el.textContent.trim() === mode);
            if (target) { target.click(); return { success: true }; }
            return { error: 'Option not found' };
        } catch(err) { return { error: err.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Context failed' };
}

/**
 * Set AI model
 */
export async function setModel(cdp, modelText) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        try {
            const model = ${JSON.stringify(modelText)};
            const KNOWN_KEYWORDS = ["Gemini", "Claude", "GPT", "Model"];
            let modelBtn = document.querySelector('[data-tooltip-id*="model"], [data-tooltip-id*="provider"]');
            if (!modelBtn) {
                const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span'))
                    .filter(el => KNOWN_KEYWORDS.some(k => (el.innerText||'').includes(k)) && el.offsetParent !== null);
                modelBtn = candidates.find(el => {
                    const s = window.getComputedStyle(el);
                    return (s.cursor === 'pointer' || el.tagName === 'BUTTON') && el.querySelector('svg');
                }) || candidates[0];
            }
            if (!modelBtn) return { error: 'Selector not found' };
            modelBtn.click();
            await new Promise(r => setTimeout(r, 600));
            let dialog = Array.from(document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], div'))
                .find(d => d.offsetHeight > 0 && d.innerText?.includes(model) && !d.innerText?.includes('Files'));
            if (!dialog) return { error: 'Menu not found' };
            const options = Array.from(dialog.querySelectorAll('*')).filter(el => el.children.length === 0 && el.textContent?.trim().length > 0);
            let target = options.find(el => el.textContent.trim() === model) || options.find(el => el.textContent.includes(model));
            if (!target) {
                const partials = options.filter(el => model.includes(el.textContent.trim())).sort((a,b) => b.textContent.length - a.textContent.length);
                target = partials[0];
            }
            if (target) {
                target.scrollIntoView({block: 'center'});
                target.click();
                return { success: true };
            }
            return { error: 'Model not found in list' };
        } catch(err) { return { error: err.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Context failed' };
}

/**
 * Start a new chat
 */
export async function startNewChat(cdp) {
    if (!cdp) return { error: 'Not connected' };
    
    // Strategy 1: Use CDP keyboard shortcut Ctrl+Shift+L (native Gemini new chat shortcut)
    try {
        // Press Ctrl+Shift+L
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
        
        // Brief delay then check if it worked
        await new Promise(r => setTimeout(r, 500));
        return { success: true, method: 'keyboard_ctrl_shift_l' };
    } catch (e) {
        console.log('⚠️ Keyboard shortcut failed:', e.message);
    }

    // Strategy 2: DOM click with proper event dispatching
    const EXP = `(async () => {
        try {
            function simulateClick(el) {
                const rect = el.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
                });
            }
            
            // Try button with title="Edit"
            const editBtn = document.querySelector('button[title="Edit"]');
            if (editBtn && editBtn.offsetParent !== null) { simulateClick(editBtn); return { success: true, method: 'simulated_click_edit' }; }
            
            // Try google-symbols "edit" icon
            const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
            const editIconBtn = allBtns.find(b => {
                const icon = b.querySelector('.google-symbols');
                return icon && icon.textContent.trim() === 'edit';
            });
            if (editIconBtn) { simulateClick(editIconBtn); return { success: true, method: 'simulated_click_google_edit' }; }
            
            // Try data-tooltip-id
            const exactBtn = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
            if (exactBtn) { simulateClick(exactBtn); return { success: true, method: 'simulated_click_tooltip' }; }
            
            return { error: 'New chat button not found' };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value?.success) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Context failed' };
}

/**
 * Get current App state
 */
export async function getAppState(cdp) {
    if (!cdp) return { mode: 'Unknown', model: 'Unknown' };
    const EXP = `(async () => {
        try {
            const state = { mode: 'Unknown', model: 'Unknown' };
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                if (el.children.length > 0) continue;
                const txt = (el.innerText || '').trim();
                if (txt !== 'Fast' && txt !== 'Planning') continue;
                let cur = el;
                for (let i=0; i<5; i++) {
                    if (!cur) break;
                    if (window.getComputedStyle(cur).cursor === 'pointer' || cur.tagName === 'BUTTON') { state.mode = txt; break; }
                    cur = cur.parentElement;
                }
                if (state.mode !== 'Unknown') break;
            }
            const KNOWN = ["Gemini", "Claude", "GPT"];
            const nodes = all.filter(el => el.children.length === 0 && el.innerText);
            let modelEl = nodes.find(el => {
                if (!KNOWN.some(k => el.innerText.includes(k))) return false;
                let p = el;
                for (let i=0; i<8; i++) {
                    if (!p) break;
                    if (p.tagName === 'BUTTON' || window.getComputedStyle(p).cursor === 'pointer') return true;
                    p = p.parentElement;
                }
                return false;
            }) || nodes.find(el => KNOWN.some(k => el.innerText.includes(k)) && el.innerText.length < 60);
            if (modelEl) state.model = modelEl.innerText.trim();
            
            // Find current workspace name from sidebar
            const wsSection = Array.from(document.querySelectorAll('button'))
                .find(b => (b.innerText || '').includes('keyboard_arrow_down'));
            if (wsSection) {
                const name = (wsSection.innerText || '')
                    .replace(/keyboard_arrow_(down|right)/g, '')
                    .replace(/more_vert/g, '')
                    .replace(/add/g, '')
                    .trim();
                if (name) state.workspace = name;
            }
            
            return state;
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { mode: 'Unknown', model: 'Unknown' };
}

/**
 * Check if chat is open
 */
export async function hasChatOpen(cdp) {
    if (!cdp) return { hasChat: false, hasMessages: false, editorFound: false };
    const EXP = `(() => {
        const c = document.getElementById('conversation') || document.getElementById('chat') || document.getElementById('cascade');
        const m = c && c.querySelectorAll('[class*="message"], [data-message]').length > 0;
        return { hasChat: !!c, hasMessages: !!m, editorFound: !!(c && c.querySelector('[data-lexical-editor="true"]')) };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { hasChat: false, hasMessages: false, editorFound: false };
}

/**
 * Click a remote element by selector/index/textContent
 */
export async function clickElement(cdp, { selector, index, textContent }) {
    if (!cdp) return { error: 'Not connected' };
    const safeText = JSON.stringify(textContent || '');
    const EXP = `(async () => {
        try {
            const root = document.getElementById('conversation') || document.getElementById('chat') || document.getElementById('cascade') || document;
            let elements = Array.from(root.querySelectorAll('${selector}'));
            const filterText = ${safeText};
            if (filterText) {
                elements = elements.filter(el => {
                    const txt = (el.innerText || el.textContent || '').trim();
                    const firstLine = txt.split('\\\\n')[0].trim();
                    return firstLine === filterText || txt.includes(filterText);
                });
                elements = elements.filter(el => !elements.some(other => other !== el && el.contains(other)));
            }
            const target = elements[${index}];
            if (target) {
                if (target.focus) target.focus();
                target.click();
                return { success: true, found: elements.length, indexUsed: ${index} };
            }
            return { error: 'Element not found' };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value?.success) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Click failed' };
}

/**
 * Get chat history from the Agent Manager sidebar
 */
export async function getChatHistory(cdp) {
    if (!cdp) throw new Error("Agent Manager not connected");

    const EXP = `(async () => {
        try {
            let pills = document.querySelectorAll('[data-testid^="convo-pill-"]');
            
            // Si la sidebar n'est pas ouverte, on essaie de cliquer sur le bouton
            if (pills.length === 0) {
                const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
                const historyBtn = buttons.find(btn => {
                    const icon = btn.querySelector('.google-symbols');
                    return icon && icon.textContent.trim() === 'history';
                });

                if (historyBtn) {
                    historyBtn.click();
                    await new Promise(r => setTimeout(r, 1500));
                    pills = document.querySelectorAll('[data-testid^="convo-pill-"]');
                }
            }

            const chats = [];
            
            pills.forEach(pill => {
                const title = pill.textContent?.trim() || '';
                const id = pill.getAttribute('data-testid')?.replace('convo-pill-', '') || '';
                const container = pill.closest('button');
                let time = '';
                let isActive = false;
                
                if (container) {
                    const timeSpans = Array.from(container.querySelectorAll('span.text-xs'));
                    const timeSpan = timeSpans.find(s => {
                        const t = s.textContent?.trim();
                        return t && (t === 'now' || /\\\\d+[mhdw]/.test(t));
                    });
                    if (timeSpan) time = timeSpan.textContent.trim();
                    container.querySelectorAll('.google-symbols').forEach(icon => {
                        if (icon.textContent?.trim() === 'progress_activity') isActive = true;
                    });
                }
                
                let workspace = 'Other';
                const section = pill.closest('.flex.flex-col.gap-px');
                if (section) {
                    const header = section.querySelector('span.text-sm.font-medium');
                    if (header) workspace = header.textContent.trim();
                }

                if (title.length > 2) {
                    chats.push({ title, id, time: time || 'Recent', isActive, workspace });
                }
            });

            return { success: true, chats };
        } catch (e) {
            return { error: e.toString(), chats: [] };
        }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Target unavailable', chats: [] };
}

/**
 * List workspaces/projects from Agent Manager
 */
export async function listProjects(cdp) {
    if (!cdp) throw new Error("Agent Manager not connected");

    const EXP = `(async () => {
        try {
            const projects = [];
            
            // Find the "+" button next to "Workspace"
            // Strategy: Find all buttons, check if they either contain 'add' or 'plus' 
            // AND are near the text 'Workspace', or just find the 'Workspace' header and navigate to the '+' button
            const allSpans = Array.from(document.querySelectorAll('span'));
            const workspaceSpan = allSpans.find(s => s.innerText?.trim() === 'Workspaces' || s.innerText?.trim() === 'Workspace');
            
            let wsBtn = null;
            if (workspaceSpan) {
                // The '+' button is usually a sibling or close parent's child
                // Traverse up slightly and find a button containing 'add' or a plus icon
                const container = workspaceSpan.closest('div.flex');
                if (container) {
                    wsBtn = container.querySelector('button');
                }
            }
            
            // Fallback: click the first button containing 'add' icon in the sidebar
            if (!wsBtn) {
                wsBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('add'));
            }
            
            if (wsBtn) {
                // Click to open the dropdown/modal
                wsBtn.click();
                await new Promise(r => setTimeout(r, 600));
                
                // Read from modal. The modal usually creates a floating portal or a list at the end of body
                const menuItems = document.querySelectorAll('div.px-2\\\\.5.cursor-pointer, [role="menuitem"], .monaco-list-row');
                if (menuItems.length > 0) {
                    menuItems.forEach((item, index) => {
                        const nameSpan = item.querySelector('span.text-sm > span') || item.querySelector('.monaco-highlighted-label') || item;
                        let name = (nameSpan.innerText || '').trim();
                        // Ignore UI control text
                        if (name && name !== 'Open Workspace' && !name.includes('keyboard_arrow') && name.length > 1) {
                            // Ensure unique
                            if (!projects.some(p => p.name === name)) {
                                projects.push({ name, path: 'Workspace ' + (index + 1), index });
                            }
                        }
                    });
                }
                
                // Click document body or Esc to close modal
                document.body.click();
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            }
            
            return { success: true, projects };
        } catch (err) { return { error: err.toString() }; }
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

    const projectName = name;
    const EXP = `(async () => {
        try {
            const targetName = "${projectName.replace(/"/g, '\\"')}";
            
            // 1. Ouvrir le menu Workspace
            const btn = document.querySelector('${SEL.sidebar.openWorkspaceButton}');
            if (!btn) throw new Error('[CDP] Selector broken: "${SEL.sidebar.openWorkspaceButton}" — element not found in openProject(). Update src/config/selectors.js');
            
            btn.click();
            await new Promise(r => setTimeout(r, 600)); // Attendre l'animation
            
            // 2. Chercher l'élément correspondant
            const items = Array.from(document.querySelectorAll('${SEL.sidebar.workspaceListItems}'));
            if (items.length === 0) {
                 document.body.click();
                 throw new Error('[CDP] Selector broken: "${SEL.sidebar.workspaceListItems}". Menu empty in openProject().');
            }
            
            const targetItem = items.find(el => {
                const nameNode = el.querySelector('${SEL.sidebar.workspaceItemName}');
                return nameNode && nameNode.innerText.trim() === targetName;
            });
            
            if (!targetItem) {
                document.body.click();
                return { success: false, error: "Project '"+targetName+"' not found in dropdown list." };
            }
            
            // 3. Cliquer sur le projet
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
    const safeChatTitle = JSON.stringify(chatTitle);
    
    const EXP = `(async () => {
        try {
            const targetTitle = ${safeChatTitle};
            
            // First ensure history panel is open
            const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
            const historyBtn = buttons.find(btn => {
                const icon = btn.querySelector('.google-symbols');
                return icon && icon.textContent.trim() === 'history';
            });
            if (historyBtn) {
                historyBtn.click();
                await new Promise(r => setTimeout(r, 800));
            }

            const pills = document.querySelectorAll('[data-testid^="convo-pill-"]');
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
            
            return { error: 'Chat not found' };
        } catch (e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Context failed' };
}

