/**
 * CDP Scripts and helpers specifically for the Antigravity Agent Manager (formerly Launchpad)
 * This is now the primary target for chat interactions, snapshots, and project management.
 */

/**
 * Capture a snapshot of the current chat UI from the Manager
 */
export async function captureSnapshot(cdp) {
    if (!cdp) return null;
    const CAPTURE_SCRIPT = `(async () => {
        const cascade = document.getElementById('conversation') || document.getElementById('chat') || document.getElementById('cascade');
        if (!cascade) {
            // Debug info
            const body = document.body;
            const childIds = Array.from(body.children).map(c => c.id).filter(id => id).join(', ');
            return { error: 'chat container not found', debug: { hasBody: !!body, availableIds: childIds } };
        }
        
        const cascadeStyles = window.getComputedStyle(cascade);
        
        // Find the main scrollable container
        const scrollContainer = cascade.querySelector('.overflow-y-auto, [data-scroll-area]') || cascade;
        const scrollInfo = {
            scrollTop: scrollContainer.scrollTop,
            scrollHeight: scrollContainer.scrollHeight,
            clientHeight: scrollContainer.clientHeight,
            scrollPercent: scrollContainer.scrollTop / (scrollContainer.scrollHeight - scrollContainer.clientHeight) || 0
        };
        
        // Clone cascade to modify it without affecting the original
        const clone = cascade.cloneNode(true);
        
        // Aggressively remove the entire interaction/input/review area
        try {
            const interactionSelectors = [
                '.relative.flex.flex-col.gap-8',
                '.flex.grow.flex-col.justify-start.gap-8',
                'div[class*="interaction-area"]',
                '.p-1.bg-gray-500\\\\/10',
                '.outline-solid.justify-between',
                '[contenteditable="true"]'
            ];

            interactionSelectors.forEach(selector => {
                clone.querySelectorAll(selector).forEach(el => {
                    try {
                        if (selector === '[contenteditable="true"]') {
                            const area = el.closest('.relative.flex.flex-col.gap-8') || 
                                         el.closest('.flex.grow.flex-col.justify-start.gap-8') ||
                                         el.closest('div[id^="interaction"]') ||
                                         el.parentElement?.parentElement;
                            if (area && area !== clone) area.remove();
                            else el.remove();
                        } else {
                            el.remove();
                        }
                    } catch(e) {}
                });
            });

            const allElements = clone.querySelectorAll('*');
            allElements.forEach(el => {
                try {
                    const text = (el.innerText || '').toLowerCase();
                    if (text.includes('review changes') || text.includes('files with changes') || text.includes('context found')) {
                        if (el.children.length < 10 || el.querySelector('button') || el.classList?.contains('justify-between')) {
                            el.style.display = 'none'; 
                            el.remove();
                        }
                    }
                } catch (e) {}
            });
        } catch (globalErr) { }

        // Convert local images to base64
        const images = clone.querySelectorAll('img');
        const promises = Array.from(images).map(async (img) => {
            const rawSrc = img.getAttribute('src');
            if (rawSrc && (rawSrc.startsWith('/') || rawSrc.startsWith('vscode-file:')) && !rawSrc.startsWith('data:')) {
                try {
                    const res = await fetch(rawSrc);
                    const blob = await res.blob();
                    await new Promise(r => {
                        const reader = new FileReader();
                        reader.onloadend = () => { img.src = reader.result; r(); };
                        reader.onerror = () => r();
                        reader.readAsDataURL(blob);
                    });
                } catch(e) {}
            }
        });
        await Promise.all(promises);

        // Fix inline file references
        try {
            const inlineTags = new Set(['SPAN', 'P', 'A', 'LABEL', 'EM', 'STRONG', 'CODE']);
            const allDivs = Array.from(clone.querySelectorAll('div'));
            for (const div of allDivs) {
                try {
                    if (!div.parentNode) continue;
                    const parent = div.parentElement;
                    if (!parent) continue;
                    
                    const parentIsInline = inlineTags.has(parent.tagName) || 
                        (parent.className && (parent.className.includes('inline-flex') || parent.className.includes('inline-block')));
                        
                    if (parentIsInline) {
                        const span = document.createElement('span');
                        while (div.firstChild) {
                            span.appendChild(div.firstChild);
                        }
                        if (div.className) span.className = div.className;
                        if (div.getAttribute('style')) span.setAttribute('style', div.getAttribute('style'));
                        span.style.display = 'inline-flex';
                        span.style.alignItems = 'center';
                        span.style.verticalAlign = 'middle';
                        div.replaceWith(span);
                    }
                } catch(e) {}
            }
        } catch(e) {}
        
        const html = clone.outerHTML;
        
        const rules = [];
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules) {
                    rules.push(rule.cssText);
                }
            } catch (e) { }
        }
        const allCSS = rules.join('\\\\n');
        
        return {
            html: html,
            css: allCSS,
            backgroundColor: cascadeStyles.backgroundColor,
            color: cascadeStyles.color,
            fontFamily: cascadeStyles.fontFamily,
            scrollInfo: scrollInfo,
            stats: {
                nodes: clone.getElementsByTagName('*').length,
                htmlSize: html.length,
                cssSize: allCSS.length
            }
        };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: CAPTURE_SCRIPT,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });

            if (result.result && result.result.value && !result.result.value.error) {
                return result.result.value;
            }
        } catch (e) {}
    }
    return null;
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

        const editors = [...document.querySelectorAll('#conversation [contenteditable="true"], #chat [contenteditable="true"], #cascade [contenteditable="true"]')]
            .filter(el => el.offsetParent !== null);
        const editor = editors.at(-1);
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
export async function remoteScroll(cdp, scrollTop, scrollPercent) {
    if (!cdp) return { error: 'Not connected' };
    const EXPRESSION = `(async () => {
        try {
            const scrollables = [...document.querySelectorAll('#conversation [class*="scroll"], #chat [class*="scroll"], #cascade [class*="scroll"], #conversation [style*="overflow"], #chat [style*="overflow"], #cascade [style*="overflow"]')]
                .filter(el => el.scrollHeight > el.clientHeight);
            const chatArea = document.querySelector('#conversation .overflow-y-auto, #chat .overflow-y-auto, #cascade .overflow-y-auto, #conversation [data-scroll-area], #chat [data-scroll-area], #cascade [data-scroll-area]');
            if (chatArea) scrollables.unshift(chatArea);
            if (scrollables.length === 0) {
                const cascade = document.getElementById('conversation') || document.getElementById('chat') || document.getElementById('cascade');
                if (cascade && cascade.scrollHeight > cascade.clientHeight) scrollables.push(cascade);
            }
            if (scrollables.length === 0) return { error: 'No scrollable element' };
            const target = scrollables[0];
            if (${scrollPercent} !== undefined) {
                target.scrollTop = (target.scrollHeight - target.clientHeight) * ${scrollPercent};
            } else {
                target.scrollTop = ${scrollTop || 0};
            }
            return { success: true, scrolled: target.scrollTop };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXPRESSION,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (res.result?.value?.success) return res.result.value;
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
    const EXP = `(async () => {
        try {
            const exactBtn = document.querySelector('[data-tooltip-id="new-conversation-tooltip"]');
            if (exactBtn) { exactBtn.click(); return { success: true }; }
            const allButtons = Array.from(document.querySelectorAll('button, [role="button"], a')).filter(b => b.offsetParent !== null);
            const plusButtons = allButtons.filter(btn => btn.querySelector('svg[class*="plus"]'));
            const topPlus = plusButtons.filter(btn => btn.getBoundingClientRect().top < 200).sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            if (topPlus.length > 0) { topPlus[0].click(); return { success: true }; }
            const ariaBtn = allButtons.find(btn => (btn.getAttribute('aria-label')||'').toLowerCase().includes('new'));
            if (ariaBtn) { ariaBtn.click(); return { success: true }; }
            return { error: 'Not found' };
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
            const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
            const historyBtn = buttons.find(btn => {
                const icon = btn.querySelector('.google-symbols');
                return icon && icon.textContent.trim() === 'history';
            });

            if (historyBtn) {
                historyBtn.click();
                await new Promise(r => setTimeout(r, 1500));
            }

            const pills = document.querySelectorAll('[data-testid^="convo-pill-"]');
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
            const items = document.querySelectorAll('div.px-2\\\\.5.cursor-pointer');
            
            items.forEach((item, index) => {
                const nameSpan = item.querySelector('span.text-sm > span');
                const pathSpan = item.querySelector('span.text-xs.opacity-50 > span');
                
                if (nameSpan) {
                    projects.push({
                        index: index,
                        name: nameSpan.innerText.trim(),
                        path: pathSpan ? pathSpan.innerText.trim() : ''
                    });
                }
            });
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

    const EXP = `(async () => {
        try {
            const targetName = ${JSON.stringify(name || '')};
            const targetIndex = ${JSON.stringify(index !== undefined ? index : -1)};
            const items = document.querySelectorAll('div.px-2\\\\.5.cursor-pointer');
            let targetEl = null;

            if (targetIndex >= 0 && targetIndex < items.length) {
                targetEl = items[targetIndex];
            } else if (targetName) {
                for (const item of items) {
                    const nameSpan = item.querySelector('span.text-sm > span');
                    if (nameSpan && nameSpan.innerText.trim() === targetName) {
                        targetEl = item; break;
                    }
                }
            }
            if (targetEl) {
                targetEl.click();
                return { success: true };
            }
            return { error: 'Project not found' };
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
