/**
 * CDP Scripts and helpers specifically for the Antigravity Workbench (main chat window)
 * The Workbench is now primarily a fallback or used for workspace-level actions.
 */

/**
 * Close history panel (Workbench specific)
 */
export async function closeHistory(cdp) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Escape', code: 'Escape', bubbles: true }));
        return { success: true };
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", {
                expression: EXP,
                returnByValue: true,
                contextId: ctx.id
            });
            if (res.result?.value?.success) return res.result.value;
        } catch (e) {}
    }
    return { error: 'Failed' };
}

/**
 * Auto-launch Agent Manager from Workbench
 */
export async function autoOpenManager(cdp) {
    if (!cdp) return false;
    const EXP = `(async () => {
        try {
            const allBtns = Array.from(document.querySelectorAll('a, button, [role="button"]')).filter(b => b.offsetParent !== null);
            const managerBtn = allBtns.find(btn => {
                const t = (btn.getAttribute('title') || '').toLowerCase();
                const a = (btn.getAttribute('aria-label') || '').toLowerCase();
                const x = (btn.innerText || '').toLowerCase();
                return t.includes('agent manager') || a.includes('agent manager') || x.includes('agent manager');
            });
            if (managerBtn) { managerBtn.click(); return { success: true }; }
            const fb = document.querySelector('#workbench\\\\.parts\\\\.titlebar .titlebar-right .action-toolbar-container a');
            if (fb) { fb.click(); return { success: true }; }
            return { error: 'Not found' };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value?.success) return true;
        } catch (e) {}
    }
    return false;
}

/**
 * Open arbitrary workspace dialog via Workbench
 */
export async function openWorkspaceDialog(cdp) {
    if (!cdp) return { error: 'Not connected' };
    const EXP = `(async () => {
        try {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'k', code: 'KeyK', ctrlKey: !isMac, metaKey: isMac, bubbles: true
            }));
            setTimeout(() => {
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'o', code: 'KeyO', ctrlKey: !isMac, metaKey: isMac, bubbles: true
                }));
            }, 50);
            return { success: true };
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
            if (result.result?.value?.success) return { success: true };
        } catch (e) {}
    }
    return { error: 'Failed to trigger dialog' };
}
