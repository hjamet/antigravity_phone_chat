import fs from 'fs';
import path from 'path';

/**
 * Process a CDP selector error, save the DOM dump, and generate an LLM-ready report.
 * @param {Object} val Error object from CDP script (contains error, domDump, lastValidRoot)
 * @param {string} functionName Name of the function where the error occurred
 * @returns {Object} Structured error report
 */
export function processSelectorError(val, functionName) {
    const { error, domDump, lastValidRoot } = val;
    
    // Extract selector from error message: [CDP] Selector broken: "..." —
    const selectorMatch = error.match(/Selector broken: "([^"]+)"/);
    const selector = selectorMatch ? selectorMatch[1] : 'Unknown selector';
    
    // Ensure debug directory exists
    const dumpDir = path.join(process.cwd(), 'debug');
    if (!fs.existsSync(dumpDir)) fs.mkdirSync(dumpDir, { recursive: true });
    
    // Save DOM dump (overwrite existing)
    const dumpPath = path.join(dumpDir, 'crash_dom.html');
    if (domDump) {
        fs.writeFileSync(dumpPath, domDump, 'utf8');
    }
    
    const timestamp = new Date().toISOString();
    
    // Generate prompt for LLM
    const llmPrompt = `## 🔴 CDP Selector Broken — Fix Required

**Failed selector**: \`${selector}\`
**Function**: \`${functionName}()\`
**Timestamp**: ${timestamp}

### Last valid DOM root (before failure)
\`\`\`html
${lastValidRoot || 'Not captured'}
\`\`\`

### Full DOM snapshot
The full DOM has been saved to \`debug/crash_dom.html\`.

### What to do
1. Open \`src/config/selectors.js\`
2. Find the entry corresponding to \`${selector}\`
3. Compare with the provided DOM snapshot to determine the correct new selector
4. Update the selector value in the code.`;

    return {
        id: Date.now().toString(),
        timestamp,
        selector,
        functionName,
        error: error,
        lastValidRoot: (lastValidRoot || '').substring(0, 1000),
        domFilePath: 'debug/crash_dom.html',
        llmPrompt
    };
}
