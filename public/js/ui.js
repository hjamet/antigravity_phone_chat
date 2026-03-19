/**
 * UI Manipulation and Snapshot Rendering
 */

export const elements = {
    chatContainer: document.getElementById('chatContainer'),
    chatContent: document.getElementById('chatContent'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    chatInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    stopBtn: document.getElementById('stopBtn'),
    historyList: document.getElementById('historyList'),
    projectList: document.getElementById('projectsList'),
    modeText: document.getElementById('modeText'),
    modelText: document.getElementById('modelText'),
    modeBtn: document.getElementById('modeBtn'),
    modelBtn: document.getElementById('modelBtn'),
    sslBanner: document.getElementById('sslBanner'),
    historyLayer: document.getElementById('historyLayer'),
    projectsLayer: document.getElementById('projectsLayer'),
    statsText: document.getElementById('statsText'),
    currentProjectName: document.getElementById('currentProjectName'),
    currentProjectStatus: document.getElementById('currentProjectStatus'),
};

/**
 * Render a chat snapshot into the UI
 */
export function renderSnapshot(data) {
    if (!data || !data.html) return;

    // Use or create the iframe
    let frame = document.getElementById('snapshot-frame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'snapshot-frame';
        frame.style.width = '100%';
        frame.style.height = '100%';
        frame.style.border = 'none';
        frame.style.minHeight = '0'; // Allow flex to control size
        frame.style.flexGrow = '1';
        elements.chatContent.innerHTML = '';
        elements.chatContent.style.display = 'flex';
        elements.chatContent.style.flexDirection = 'column';
        elements.chatContent.appendChild(frame);
    }

    const doc = frame.contentDocument || frame.contentWindow.document;
    
    // Determine colors from snapshot data or defaults
    const bgColor = data.backgroundColor || '#1e1e2e';
    const textColor = data.color || '#cdd6f4';
    const fontFamily = data.fontFamily || 'system-ui, -apple-system, sans-serif';

    // Always re-create document to avoid stale state
    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
<style id="injected-css">
/* Override VSCode CSS variables that won't resolve in iframe */
:root, body {
    --vscode-foreground: ${textColor};
    --vscode-editor-background: ${bgColor};
    --vscode-editor-foreground: ${textColor};
    --vscode-textLink-foreground: #89b4fa;
    --vscode-textBlockQuote-background: rgba(255,255,255,0.05);
    --vscode-textBlockQuote-border: rgba(255,255,255,0.1);
    --foreground: ${textColor};
    --fgColor-default: ${textColor};
    --bgColor-default: ${bgColor};
    color-scheme: dark;
}
body {
    margin: 0;
    padding: 12px 16px;
    background-color: ${bgColor};
    color: ${textColor};
    font-family: ${fontFamily};
    font-size: 14px;
    line-height: 1.6;
    overflow-x: hidden;
}
/* Make all text visible */
* { color: inherit; }
a { color: #89b4fa; }
code, pre {
    background: rgba(255,255,255,0.06);
    border-radius: 4px;
    padding: 2px 4px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 13px;
}
pre { padding: 12px; overflow-x: auto; }
pre code { padding: 0; background: transparent; }
img { max-width: 100%; border-radius: 8px; }
/* Hide scrollbars for cleaner look */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
</style>
<style id="snapshot-css"></style>
</head>
<body><div id="root"></div></body>
</html>`);
    doc.close();

    const root = doc.getElementById('root');
    const snapshotCss = doc.getElementById('snapshot-css');

    // Inject snapshot CSS (from Manager)
    if (data.css) snapshotCss.textContent = data.css;

    // Inject HTML content
    root.innerHTML = data.html;

    // Apply background to outer container too
    if (elements.chatContainer) {
        elements.chatContainer.style.backgroundColor = bgColor;
    }
    
    return frame;
}

/**
 * Update app state badges/text
 */
export function updateStateUI(state) {
    if (!state) return;
    if (elements.modeText && state.mode) {
        elements.modeText.textContent = state.mode;
        elements.modeBtn?.classList.toggle('active', state.mode === 'Planning');
    }
    if (elements.modelText && state.model) {
        elements.modelText.textContent = state.model;
    }
    // Update status indicators  
    if (elements.statsText) {
        elements.statsText.textContent = state.mode && state.model 
            ? `${state.mode} · ${state.model}` 
            : 'Connected';
    }
    if (elements.currentProjectStatus) {
        elements.currentProjectStatus.textContent = state.workspace || 'Connected';
    }
    if (elements.currentProjectName && state.workspace) {
        elements.currentProjectName.textContent = state.workspace;
    }
}

/**
 * Toggle visibility of layers/modals
 */
export function toggleLayer(element, show = true) {
    if (element) {
        element.classList.toggle('show', show);
    }
}

/**
 * Toggle a modal by its element ID
 */
export function toggleModal(id, show = true) {
    const el = document.getElementById(id);
    toggleLayer(el, show);
}
