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
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in getAvailableModels()');

            // Find the model clickable element inside the controls row
            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in getAvailableModels()');

            const modelBtn = controlsRow.querySelector(SEL.controls.modelClickable);
            if (!modelBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modelClickable + '" — not found in getAvailableModels()');

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
            const cancel = document.querySelector(SEL.controls.cancelButton);
            if (cancel && cancel.offsetParent !== null) return { ok:false, reason:"busy" };

            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in injectMessage()');

            const editor = inputBox.querySelector(SEL.controls.editor);
            if (!editor) throw new Error('[CDP] Selector broken: "' + SEL.controls.editor + '" — not found in injectMessage()');

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

            const submitIcon = document.querySelector(SEL.controls.submitButton);
            const submit = submitIcon?.closest("button");
            if (submit && !submit.disabled) {
                submit.click();
                return { ok:true, method:"click_submit" };
            }

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
            const cancel = document.querySelector(SEL.controls.cancelButton);
            if (cancel && cancel.offsetParent !== null) {
                cancel.click();
                return { success: true };
            }
            return { error: 'No active generation found' };
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
                
            if (!chatScroll) throw new Error('[CDP] Selector broken: "' + SEL.chat.scrollContainer + '" — not found in remoteScroll()');
            
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
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const mode = ${JSON.stringify(modeText)};
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in setMode()');

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in setMode()');

            // Read current mode from the mode button label
            const modeBtn = controlsRow.querySelector(SEL.controls.modeButton);
            if (!modeBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modeButton + '" — not found in setMode()');

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
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const model = ${JSON.stringify(modelText)};
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in setModel()');

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in setModel()');

            const modelBtn = controlsRow.querySelector(SEL.controls.modelClickable);
            if (!modelBtn) throw new Error('[CDP] Selector broken: "' + SEL.controls.modelClickable + '" — not found in setModel()');

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
 * Get current App state (mode, model, workspace)
 */
export async function getAppState(cdp) {
    if (!cdp) return { mode: 'Unknown', model: 'Unknown' };
    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const state = { mode: 'Unknown', model: 'Unknown' };
            const inputBox = document.querySelector(SEL.controls.inputBox);
            if (!inputBox) throw new Error('[CDP] Selector broken: "' + SEL.controls.inputBox + '" — not found in getAppState()');

            const controlsRow = inputBox.querySelector(SEL.controls.controlsRow);
            if (!controlsRow) throw new Error('[CDP] Selector broken: "' + SEL.controls.controlsRow + '" — not found in getAppState()');

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

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, contextId: ctx.id });
            if (res.result?.value) return res.result.value;
        } catch (e) {}
    }
    return { hasChat: false, hasMessages: false, editorFound: false };
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
            const sel = ${safeSelector};
            const elements = Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
            if (elements.length === 0) throw new Error('[CDP] Selector "' + sel + '" returned 0 visible elements in clickElement()');
            const target = elements[${index || 0}];
            if (!target) throw new Error('[CDP] Element at index ${index || 0} not found for selector "' + sel + '" (' + elements.length + ' total)');
            target.focus?.();
            target.click();
            return { success: true, found: elements.length, indexUsed: ${index || 0} };
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
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
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

                let workspace = 'Other';
                const section = pill.closest(SEL.history.sectionContainer);
                if (section) {
                    const header = section.querySelector(SEL.history.sectionHeader);
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
 * List workspaces/projects from Agent Manager sidebar
 */
export async function listProjects(cdp) {
    if (!cdp) throw new Error("Agent Manager not connected");

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            // Open workspace dialog using the known button
            const btn = document.querySelector(SEL.sidebar.openWorkspaceButton);
            if (!btn) throw new Error('[CDP] Selector broken: "' + SEL.sidebar.openWorkspaceButton + '" — not found in listProjects()');

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
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const targetName = ${JSON.stringify(projectName)};

            // 1. Open the Workspace menu
            const btn = document.querySelector(SEL.sidebar.openWorkspaceButton);
            if (!btn) throw new Error('[CDP] Selector broken: "' + SEL.sidebar.openWorkspaceButton + '" — not found in openProject()');

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
    const safeChatTitle = JSON.stringify(chatTitle);

    const EXP = `(async () => {
        const SEL = ${JSON.stringify(SELECTORS)};
        try {
            const targetTitle = ${safeChatTitle};

            // Ensure history panel is open
            const navBtns = Array.from(document.querySelectorAll(SEL.sidebarNav.navButton))
                .filter(d => d.offsetParent !== null);
            const historyBtn = navBtns.find(btn => {
                const icon = btn.querySelector(SEL.sidebarNav.googleSymbol);
                return icon && icon.textContent.trim() === SEL.sidebarNav.historyIcon;
            });
            if (historyBtn) {
                historyBtn.click();
                await new Promise(r => setTimeout(r, 800));
            }

            const pills = document.querySelectorAll(SEL.history.conversationPill);
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
