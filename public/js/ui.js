/**
 * UI Manipulation and Chat State Rendering
 * Phase 5: Renders from /api/chat-state controller endpoint
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

// State tracking
let lastRenderedHash = '';

/**
 * Render chat state from /api/chat-state response
 * Uses incremental DOM updates to avoid flicker
 */
export function renderChatState(state) {
    if (!state) return;
    
    const container = elements.chatContent;
    if (!container) return;
    
    const messages = state.messages || [];
    
    // Build hash for change detection
    const hash = messages.map(m => `${m.type}:${m.role}:${(m.content||'').substring(0,40)}:${(m.title||'')}:${m.subtitles?.length||0}`).join('|') + (state.isStreaming ? ':S' : ':X');
    
    if (hash === lastRenderedHash) return;
    lastRenderedHash = hash;
    
    // Check if user is near the bottom before update
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    
    // Remove initial loading state on first render
    container.querySelectorAll('.loading-state').forEach(el => el.remove());
    
    // Get existing message divs (exclude streaming indicator)
    const existing = Array.from(container.querySelectorAll('.chat-msg'));
    
    // Update or create each message
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgHash = getMessageHash(msg);
        
        if (i < existing.length) {
            if (existing[i].getAttribute('data-hash') !== msgHash) {
                // Update existing element in-place to avoid triggering CSS animations
                const temp = document.createElement('div');
                temp.innerHTML = buildMessageHtml(msg);
                const newEl = temp.firstElementChild;
                
                existing[i].innerHTML = newEl.innerHTML;
                existing[i].className = newEl.className;
                existing[i].setAttribute('data-hash', msgHash);
            }
        } else {
            // Append new element
            const temp = document.createElement('div');
            temp.innerHTML = buildMessageHtml(msg);
            const newEl = temp.firstElementChild;
            newEl.setAttribute('data-hash', msgHash);
            container.appendChild(newEl);
        }
    }
    
    // Remove extra old elements
    const currentMsgs = container.querySelectorAll('.chat-msg');
    for (let i = messages.length; i < currentMsgs.length; i++) {
        currentMsgs[i].remove();
    }

    // Streaming indicator
    updateStreamingIndicator(state.isStreaming);

    // Only auto-scroll if user was near the bottom
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
    
    return container;
}

/**
 * Generate a simple hash from message contents
 */
function getMessageHash(msg) {
    const s = `${msg.type}:${msg.role}:${(msg.content||'').substring(0,60)}:${(msg.title||'')}:${msg.subtitles?.length||0}`;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
    }
    return hash.toString();
}

/**
 * Build HTML string for a message (no DOM creation, just string)
 */
function buildMessageHtml(msg) {
    if (msg.role === 'user') {
        return `<div class="chat-msg user-msg"><div class="msg-label">You</div><div class="msg-body">${escapeHtml(msg.content || '')}</div></div>`;
    } else if (msg.type === 'taskBlock') {
        let html = '<div class="chat-msg task-msg">';
        if (msg.title) html += `<div class="task-title">🎯 ${escapeHtml(msg.title)}</div>`;
        if (msg.content) html += `<div class="task-paragraph">${escapeHtml(msg.content)}</div>`;
        if (msg.subtitles && msg.subtitles.length > 0) {
            html += '<div class="task-steps">';
            msg.subtitles.forEach((s, i) => {
                if (s) html += `<div class="task-step"><span class="step-num">${i + 1}</span>${escapeHtml(s)}</div>`;
            });
            html += '</div>';
        }
        html += '</div>';
        return html;
    } else {
        return `<div class="chat-msg agent-msg"><div class="msg-label">Agent</div><div class="msg-body">${formatAgentText(msg.content || '')}</div></div>`;
    }
}

/**
 * Format agent text with basic markdown-like rendering
 */
function formatAgentText(text) {
    return escapeHtml(text)
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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
 * LEGACY: renderSnapshot for backward compatibility with WS updates
 */
export function renderSnapshot(data) {
    // If it looks like a chat-state response, use the new renderer
    if (data?.messages && data.messages[0]?.type) {
        return renderChatState(data);
    }
    
    // Legacy fallback
    const container = elements.chatContent;
    if (!container || !data) return;
    
    if (data.html) {
        container.innerHTML = `<div style="padding: 16px; color: #cdd6f4;">${data.html}</div>`;
    }
    return container;
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
    if (elements.statusDot) {
        elements.statusDot.className = 'status-dot connected';
    }
    if (elements.statusText) {
        elements.statusText.textContent = state.workspace || 'Connected';
    }
    // Fix stuck "Connecting..." and "Syncing..." labels
    const projectStatus = document.getElementById('currentProjectStatus');
    if (projectStatus) {
        projectStatus.textContent = state.workspace ? 'Connected' : 'Online';
    }
    const statsText = document.getElementById('statsText');
    if (statsText) {
        statsText.textContent = state.workspace || 'Ready';
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
