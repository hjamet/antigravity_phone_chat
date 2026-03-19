/**
 * UI Manipulation and Snapshot Rendering
 * Phase 2: Native chat rendering (no iframe)
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

// State for tracking current messages to avoid full re-renders
let lastMessageCount = 0;

/**
 * Render chat messages natively (no iframe)
 */
export function renderSnapshot(data) {
    if (!data) return;
    
    // Support new JSON format (messages array) 
    const messages = data.messages;
    if (!messages || !Array.isArray(messages)) {
        // Fallback: if we got old-format data with html field, show raw text
        if (data.html) {
            showFallbackHtml(data);
        }
        return;
    }

    const container = elements.chatContent;
    if (!container) return;
    
    // Only do a full re-render if the message count changed
    if (messages.length !== lastMessageCount) {
        container.innerHTML = '';
        lastMessageCount = messages.length;
        
        messages.forEach((msg, idx) => {
            const bubble = createMessageBubble(msg, idx);
            container.appendChild(bubble);
        });
    } else {
        // Update the last message (might be streaming)
        const lastBubble = container.lastElementChild;
        const lastMsg = messages[messages.length - 1];
        if (lastBubble && lastMsg) {
            const contentEl = lastBubble.querySelector('.msg-content');
            if (contentEl) {
                contentEl.innerHTML = formatContent(lastMsg);
            }
        }
    }
    
    // Show streaming indicator
    updateStreamingIndicator(data.isStreaming);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    return container;
}

/**
 * Create a single chat message bubble
 */
function createMessageBubble(msg, index) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${msg.role}`;
    div.dataset.index = index;
    
    // Role indicator
    const roleLabel = document.createElement('div');
    roleLabel.className = 'msg-role';
    roleLabel.textContent = msg.role === 'user' ? '👤 You' : '🤖 Agent';
    
    // Content 
    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = formatContent(msg);
    
    div.appendChild(roleLabel);
    div.appendChild(content);
    
    return div;
}

/**
 * Format message content for display
 */
function formatContent(msg) {
    // For agent messages, if we have pre-rendered HTML from the DOM, use it
    // But we need to sanitize it (remove VSCode-specific stuff)
    if (msg.role === 'agent' && msg.html) {
        // Clean the HTML: remove VSCode CSS vars, fix colors
        let html = msg.html;
        // Remove empty skeleton divs
        html = html.replace(/<div[^>]*class="[^"]*bg-gray-500\/10[^"]*"[^>]*style="height:\s*[\d.]+px[^"]*"[^>]*><\/div>/g, '');
        // Remove zero-height divs
        html = html.replace(/<div[^>]*style="height:\s*0px[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
        return html;
    }
    
    // For user messages or messages without HTML, format the plain text
    const text = msg.content || '';
    // Basic markdown-to-HTML for plain text
    return escapeHtml(text)
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show/hide streaming indicator
 */
function updateStreamingIndicator(isStreaming) {
    let indicator = document.getElementById('streamingIndicator');
    if (isStreaming) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'streamingIndicator';
            indicator.className = 'streaming-indicator';
            indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            elements.chatContent?.appendChild(indicator);
        }
    } else {
        indicator?.remove();
    }
}

/**
 * Fallback for old HTML format
 */
function showFallbackHtml(data) {
    const container = elements.chatContent;
    if (!container) return;
    container.innerHTML = `<div style="padding: 16px; color: #cdd6f4;">${data.html}</div>`;
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
    // Update status dot & text
    if (elements.statusDot) {
        elements.statusDot.className = 'status-dot connected';
    }
    if (elements.statusText) {
        elements.statusText.textContent = state.workspace || 'Connected';
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
