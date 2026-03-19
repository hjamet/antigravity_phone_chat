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
        elements.chatContent.innerHTML = '';
        elements.chatContent.appendChild(frame);
    }

    const doc = frame.contentDocument || frame.contentWindow.document;
    
    // Create base structure if empty
    if (!doc.head.innerHTML) {
        doc.open();
        doc.write('<!DOCTYPE html><html><head><style id="injected-css"></style></head><body style="margin:0; padding:10px;"><div id="root"></div></body></html>');
        doc.close();
    }

    const root = doc.getElementById('root');
    const styleTag = doc.getElementById('injected-css');

    // Update CSS
    if (data.css) styleTag.textContent = data.css;

    // Update HTML content
    root.innerHTML = data.html;

    // Apply background color from snapshot
    if (data.backgroundColor) {
        doc.body.style.backgroundColor = data.backgroundColor;
        elements.chatContainer.style.backgroundColor = data.backgroundColor;
    }
    if (data.color) doc.body.style.color = data.color;
    if (data.fontFamily) doc.body.style.fontFamily = data.fontFamily;
    
    return frame;
}

/**
 * Update app state badges/text
 */
export function updateStateUI(state) {
    if (!state) return;
    if (elements.modeText && state.mode) {
        elements.modeText.textContent = state.mode;
        elements.modeBtn.classList.toggle('active', state.mode === 'Planning');
    }
    if (elements.modelText && state.model) {
        elements.modelText.textContent = state.model;
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
