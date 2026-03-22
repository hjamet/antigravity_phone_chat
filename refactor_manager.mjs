import fs from 'fs';
import path from 'path';

const file = 'src/cdp/manager.js';
let content = fs.readFileSync(file, 'utf8');

const helperLogic = `import fs from 'fs';
import path from 'path';

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
                    const dumpDir = path.join(process.cwd(), 'debug');
                    if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
                    const dumpPath = path.join(dumpDir, 'crash_dom.html');
                    fs.writeFileSync(dumpPath, val.domDump, 'utf8');
                    
                    console.error(\`\\n❌ [CRASH SILENCIEUX ÉVITÉ] Erreur CDP dans la fonction: \${functionName}()\`);
                    console.error(\`   Message: \${val.error}\`);
                    if (val.lastValidRoot) {
                        console.error(\`   Dernière racine commune trouvée (Extrait):\\n     \${val.lastValidRoot.trim()}\`);
                    }
                    console.error(\`\\n   👉 Fichier DOM complet généré pour consultation : \${dumpPath}\\n\`);
                    
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

`;

if (!content.includes('runCdpScript')) {
    content = content.replace(/(import \{ SELECTORS \} from '\.\.\/config\/selectors\.js';)/, "$1\\n\\n" + helperLogic);
}

// Spilt by export async function to safely process each function independently
const parts = content.split('export async function ');
for (let i = 1; i < parts.length; i++) {
    let fnBody = parts[i];
    const fnNameMatch = fnBody.match(/^([a-zA-Z0-9_]+)/);
    if (!fnNameMatch) continue;
    const fnName = fnNameMatch[1];
    
    // 1. Inject lastValidRoot
    fnBody = fnBody.replace(/try\s*\{(\s*)(const\s+inputBox|const\s+cancel|const\s+chatScroll|const\s+mode|const\s+sel\s*=|const\s+target|function\s+simulateClick|let\s+pills|const\s+btn|const\s+state|const\s+artHeader)/g, (match, spaces, codeStart) => {
        return "try {" + spaces + "let lastValidRoot = document.body;" + spaces + codeStart;
    });
    fnBody = fnBody.replace(/try\s*\{\s*const chatScroll = Array\.from/g, 'try {\\n            let lastValidRoot = document.body;\\n            const chatScroll = Array.from');

    // 2. Inject lastValidRoot updates on selector fails
    fnBody = fnBody.replace(/(if\s*\(!([a-zA-Z0-9_]+)\)\s*throw\s+new\s+Error[^;]+;)/g, "$1\\n            if(typeof lastValidRoot !== 'undefined') lastValidRoot = $2;");

    // 3. Update catch blocks inside the CDP script
    fnBody = fnBody.replace(/catch\s*\(\s*([a-zA-Z]+)\s*\)\s*\{\s*return\s*\{\s*(error\s*:\s*\1\.toString\(\)(?:[^}]*))(?:\s*\}\s*;|\s*\})\s*\}/g, (match, errVar, innerProps) => {
        if (innerProps.includes('domDump')) return match;
        return "catch(" + errVar + ") { " +
               "    return { " +
               "        " + innerProps + ", " +
               "        domDump: document.documentElement ? document.documentElement.outerHTML : ''," +
               "        lastValidRoot: typeof lastValidRoot !== 'undefined' && lastValidRoot ? lastValidRoot.outerHTML.substring(0, 600) : ''" +
               "    }; " +
               "}";
    });

    // 4. Replace the Node CDP execution loop
    if (fnName === 'captureSnapshot') {
        fnBody = fnBody.replace(/for\s*\(\s*const\s*ctx\s*of\s*cdp\.contexts\s*\)\s*\{[\s\S]*?return\s*null\s*;\s*\}/, "const val = await runCdpScript(cdp, CAPTURE_SCRIPT, 'captureSnapshot');\\n    if (val && !val.error) return val;\\n    return null;\\n}");
    } else {
        // Standard loop
        const loopRegex = /for\s*\(\s*const\s*ctx\s*of\s*cdp\.contexts\s*\)\s*\{[\s\S]*?return\s*\{\s*(?:error|success|mode|hasChat)[^\}]*\}\s*;\s*\}/;
        fnBody = fnBody.replace(loopRegex, "return await runCdpScript(cdp, EXP, '" + fnName + "');\\n}");
    }
    
    parts[i] = fnBody;
}

content = parts.join('export async function ');
fs.writeFileSync(file, content);
console.log('Refactoring applied safely!');
