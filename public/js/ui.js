/**
 * UI Manipulation and Snapshot Rendering
 * Phase 3: Simplified last-message rendering
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
let lastRenderedHash = '';

/**
 * Render chat messages natively (no iframe)
 * Shows the last user message + last significant agent message
 */
export function renderSnapshot(data) {
    if (!data) return;
    
    const messages = data.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        if (data.html) {
            showFallbackHtml(data);
        }
        return;
    }

    // Get last user message from snapshot
    let lastSnapshotUser = null;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user' && messages[i].content?.length > 20) {
            lastSnapshotUser = messages[i];
            break;
        }
    }
    
    // Get last significant agent message (> 300 chars to skip progress updates)
    let lastAgent = null;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'agent' && messages[i].content?.length > 300) {
            lastAgent = messages[i];
            break;
        }
    }
    
    // Get user message from localStorage (source of truth)
    const savedUserMsg = localStorage.getItem('lastUserMessage') || '';
    
    // Pick the best user content: prefer the longest between localStorage and snapshot
    const userContent = (savedUserMsg.length > (lastSnapshotUser?.content?.length || 0))
        ? savedUserMsg 
        : (lastSnapshotUser?.content || savedUserMsg);

    // Build a hash to detect changes
    const hash = (userContent?.substring(0, 50) || '') + '|' + (lastAgent?.content?.substring(0, 50) || '');
    
    const container = elements.chatContent;
    if (!container) return;
    
    // Only re-render if content changed
    if (hash !== lastRenderedHash) {
        lastRenderedHash = hash;
        container.innerHTML = '';
        
        if (userContent) {
            container.appendChild(createMessageBubble({ role: 'user', content: userContent }, 'user'));
        }
        
        if (lastAgent) {
            container.appendChild(createMessageBubble(lastAgent, 'agent'));
        }
    } else {
        // Content hasn't changed structurally, update last agent bubble (streaming)
        const agentBubble = container.querySelector('.chat-bubble.agent .msg-content');
        if (agentBubble && lastAgent) {
            agentBubble.innerHTML = formatContent(lastAgent);
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
function createMessageBubble(msg, role) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    
    // Role indicator
    const roleLabel = document.createElement('div');
    roleLabel.className = 'msg-role';
    roleLabel.textContent = role === 'user' ? '👤 You' : '🤖 Agent';
    
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
    if (msg.role === 'agent' && msg.html) {
        let html = msg.html;
        // Remove skeleton placeholder divs (virtualized rows)
        html = html.replace(/<div[^>]*class="[^"]*rounded-lg bg-gray-500\/10[^"]*"[^>]*style="height:\s*[\d.]+px[^"]*"[^>]*><\/div>/g, '');
        // Remove empty wrapper divs left behind
        html = html.replace(/<div><\/div>/g, '');
        // Remove feedback buttons (copy, thumbs up/down)
        html = html.replace(/<button[^>]*data-tooltip-id[^>]*>[\s\S]*?<\/button>/g, '');
        // Remove google-symbols icon spans
        html = html.replace(/<span[^>]*class="[^"]*google-symbols[^"]*"[^>]*>[\s\S]*?<\/span>/g, '');
        // Remove text artifacts from icon fallback
        html = html.replace(/\bcontent_copy\b/g, '');
        html = html.replace(/\bthumb_up\b/g, '');
        html = html.replace(/\bthumb_down\b/g, '');
        // Remove divs with only whitespace
        html = html.replace(/<div[^>]*>\s*<\/div>/g, '');
        // Remove style tags (huge injected CSS from Agent Manager)
        html = html.replace(/<style[\s\S]*?<\/style>/g, '');
        return html;
    }
    
    // For user messages or messages without HTML, format the plain text
    const text = msg.content || '';
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
