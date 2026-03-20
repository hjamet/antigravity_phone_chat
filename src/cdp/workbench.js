/**
 * CDP Scripts and helpers specifically for the Antigravity Workbench (main chat window)
 * The Workbench is now primarily a fallback or used for workspace-level actions.
 */

import { SELECTORS as SEL } from '../config/selectors.js';


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

export async function autoOpenManager(cdp) {
    if (!cdp) return false;
    const EXP = `(async () => {
        try {
            const fb = document.querySelector('${SEL.workbench.managerButton}');
            if (!fb) {
                 throw new Error('[CDP] Selector broken: "${SEL.workbench.managerButton}" — element not found in autoOpenManager(). Update src/config/selectors.js');
            }
            fb.click();
            return { success: true };
        } catch(e) { return { error: e.toString() }; }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const res = await cdp.call("Runtime.evaluate", { expression: EXP, returnByValue: true, awaitPromise: true, contextId: ctx.id });
            if (res.result?.value?.success) return true;
            if (res.result?.value?.error) {
                 console.error(res.result.value.error); // Fait loguer l'erreur côté serveur
                 throw new Error(res.result.value.error); // Propage au serveur
            }
        } catch (e) {
            throw e; // Laisse server.js attraper l'erreur et l'afficher
        }
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
