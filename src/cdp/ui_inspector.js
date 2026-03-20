/**
 * UI Inspector Service
 * Provides raw DOM diagnostic tools via CDP
 */

/**
 * Inspects the UI tree of a CDP target (typically the Workbench).
 * Returns a JSON representation of the DOM with tags and classes.
 * @param {Object} cdp CDP connection object
 * @returns {Promise<Object>} Tree structure of the UI
 */
export async function inspectUI(cdp) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) {
        throw new Error('No CDP connection');
    }

    const SCRIPT = `(() => {
        function dumpTree(el, depth = 0) {
            if (depth > 20 || !el) return null;
            const res = {
                tag: el.tagName.toLowerCase(),
                cls: (el.className || '').toString().substring(0, 100),
                id: el.id || undefined,
                txt: el.children.length === 0 ? (el.innerText || '').substring(0, 50).trim() : undefined
            };
            const children = Array.from(el.children).map(c => dumpTree(c, depth + 1)).filter(Boolean);
            if (children.length > 0) res.ch = children;
            return res;
        }
        return dumpTree(document.body);
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: SCRIPT,
                returnByValue: true,
                contextId: ctx.id
            });
            if (result.result?.value) return result.result.value;
        } catch (e) { /* next */ }
    }
    throw new Error('Failed to inspect UI');
}

/**
 * Executes a debug script on the Manager CDP to inspect the DOM structure.
 * This is useful for troubleshooting broken selectors in captureSnapshot.
 * @param {Object} cdp CDP connection object
 * @returns {Promise<Object>} Structured DOM info or error
 */
export async function debugManagerDom(cdp) {
    if (!cdp || !cdp.ws || cdp.ws.readyState !== 1) {
        throw new Error('No CDP connection');
    }

    const DEBUG_SCRIPT = `(async () => {
        try {
            const chatScroll = Array.from(document.querySelectorAll('[class*="scrollbar-hide"][class*="overflow-y"]'))
                .filter(el => el.scrollHeight > 100 && el.offsetWidth > 200)
                .sort((a,b) => b.scrollHeight - a.scrollHeight)[0];
            
            if (!chatScroll) return { error: 'no chatScroll found' };
            
            const wrapper = chatScroll.children[0]; 
            const innerDiv = wrapper?.children[0]; 
            const turnsDiv = innerDiv?.querySelector('.relative.flex.flex-col') || innerDiv; 
            
            const turns = Array.from(turnsDiv?.children || []);
            const lastTurns = turns.slice(-5);
            
            return {
                totalTurns: turns.length,
                scroll: { top: chatScroll.scrollTop, h: chatScroll.scrollHeight },
                turns: lastTurns.map((turn, idx) => {
                    const globalIdx = turns.length - lastTurns.length + idx;
                    const isUser = !!turn.querySelector('[class*="bg-gray-500"][class*="select-text"]');
                    const isolateBlocks = Array.from(turn.querySelectorAll('.isolate'));
                    
                    return {
                        idx: globalIdx,
                        type: isUser ? 'user' : 'agent',
                        html: turn.innerHTML.substring(0, 500),
                        blocks: isolateBlocks.map(iso => ({
                            cls: iso.className,
                            childCount: iso.children.length,
                            firstChild: (iso.children[0]?.innerText || '').substring(0, 100)
                        }))
                    };
                })
            };
        } catch(e) {
            return { error: e.message, stack: e.stack?.substring(0, 300) };
        }
    })()`;

    for (const ctx of cdp.contexts) {
        try {
            const result = await cdp.call("Runtime.evaluate", {
                expression: DEBUG_SCRIPT,
                returnByValue: true,
                awaitPromise: true,
                contextId: ctx.id
            });
            if (result.result?.value && !result.result.value.error) {
                return result.result.value;
            }
        } catch(e) { /* next */ }
    }
    
    throw new Error('No valid CDP context found for debug');
}
