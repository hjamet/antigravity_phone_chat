/**
 * CDP Scripts and helpers specifically for the Agent Manager (formerly Launchpad)
 */

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
 * Select a specific chat by title from Workbench history panel
 * Note: This usually runs on Workbench contexts but triggered by manager interaction
 */
export async function selectChat(cdp, chatTitle) {
    const safeChatTitle = JSON.stringify(chatTitle);
    const EXP = `(async () => {
    try {
        const targetTitle = ${safeChatTitle};
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
        let historyBtn = null;
        for (const btn of allButtons) {
            if (btn.offsetParent === null) continue;
            const hasIcon = btn.querySelector('svg.lucide-clock, svg.lucide-history, svg.lucide-folder, svg.lucide-clock-rotate-left');
            if (hasIcon) { historyBtn = btn; break; }
        }
        if (!historyBtn) {
            const top = allButtons.filter(b => b.offsetParent !== null && b.getBoundingClientRect().top < 100)
                .sort((a,b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            if (top.length >= 2) historyBtn = top[1];
        }
        if (historyBtn) { historyBtn.click(); await new Promise(r => setTimeout(r, 600)); }
        
        const candidates = Array.from(document.querySelectorAll('*')).filter(el => {
            if (el.offsetParent === null) return false;
            const t = el.innerText?.trim();
            return t && t.startsWith(targetTitle.substring(0, Math.min(30, targetTitle.length)));
        });

        let target = null; let maxD = -1;
        for (const el of candidates) {
            if (el.children.length > 5) continue;
            let d = 0, p = el; while(p) { d++; p=p.parentElement; }
            if (d > maxD) { maxD = d; target = el; }
        }

        if (target) {
            let cl = target;
            for (let i=0; i<5; i++) {
                if (!cl) break;
                if (window.getComputedStyle(cl).cursor === 'pointer' || cl.tagName === 'BUTTON') break;
                cl = cl.parentElement;
            }
            if (cl) cl.click(); else target.click();
            return { success: true };
        }
        return { error: 'Not found' };
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
