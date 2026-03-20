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

/**
 * Render chat state from /api/chat-state response.
 * ZERO-FLICKER: Each message has its own hash. Only messages whose hash changed
 * are patched via textContent/innerHTML. No coarse gatekeeping hash — the per-message
 * hash comparison IS the gate.
 */
export function renderChatState(state) {
    if (!state) return;
    
    const container = elements.chatContent;
    if (!container) return;
    
    let messages = [...(state.messages || [])];
    
    const pendingMsg = localStorage.getItem('pendingUserMessage');
    if (pendingMsg) {
        const serverUserMsgs = messages.filter(m => m.role === 'user');
        const lastServerUserMsg = serverUserMsgs.length > 0 ? serverUserMsgs[serverUserMsgs.length - 1] : null;
        
        if (lastServerUserMsg && lastServerUserMsg.content.trim() === pendingMsg.trim()) {
            localStorage.removeItem('pendingUserMessage');
        } else {
            messages.push({ 
                role: 'user', 
                type: 'message', 
                content: window.isAgentStreaming ? `${pendingMsg} ⏳` : pendingMsg 
            });
        }
    }
    
    // Check if user is near the bottom before update
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    
    // Remove initial loading state on first render
    const loadingEls = container.querySelectorAll('.loading-state');
    if (loadingEls.length > 0) loadingEls.forEach(el => el.remove());
    
    // Get existing message divs (exclude streaming indicator)
    const existing = Array.from(container.querySelectorAll('.chat-msg'));
    
    let anyChanged = false;
    
    // Update or create each message
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgHash = getMessageHash(msg);
        
        if (i < existing.length) {
            const el = existing[i];
            // ONLY touch this element if its content actually changed
            if (el.getAttribute('data-hash') !== msgHash) {
                anyChanged = true;
                // Patch inner content directly — never touch className or outer element
                el.innerHTML = buildMessageInner(msg);
                el.setAttribute('data-hash', msgHash);
            }
        } else {
            // Brand new element — append with one-time fade-in
            anyChanged = true;
            const div = document.createElement('div');
            div.className = getCssClass(msg) + ' chat-msg-enter';
            div.innerHTML = buildMessageInner(msg);
            div.setAttribute('data-hash', msgHash);
            container.appendChild(div);
            div.addEventListener('animationend', () => div.classList.remove('chat-msg-enter'), { once: true });
        }
    }
    
    // Remove extra old elements (only if message count decreased)
    if (existing.length > messages.length) {
        for (let i = messages.length; i < existing.length; i++) {
            existing[i].remove();
        }
        anyChanged = true;
    }

    // Streaming indicator
    updateStreamingIndicator(state.isStreaming);
    window.isAgentStreaming = state.isStreaming;

    // Only auto-scroll if something changed AND user was near the bottom
    if (anyChanged && isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
    
    return container;
}

/**
 * Get CSS class for a message type (without animation classes)
 */
function getCssClass(msg) {
    if (msg.role === 'user') return 'chat-msg user-msg';
    if (msg.type === 'taskBlock') return 'chat-msg task-msg';
    return 'chat-msg agent-msg';
}

/**
 * Generate a hash from message contents.
 * This hash is the SOLE gate for DOM updates — it must include everything
 * that affects the visual rendering of the message.
 */
function getMessageHash(msg) {
    const s = [
        msg.type || '',
        msg.role || '',
        msg.title || '',
        (msg.content || '').substring(0, 80),
        String(msg.allStatuses?.length || 0),
    ].join(':');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
    }
    return hash.toString();
}

/**
 * Build the INNER HTML of a message div.
 */
function buildMessageInner(msg) {
    const renderContent = (m) => {
        if (m.html) {
            return m.html.replace(/<style[\s\S]*?<\/style>/g, '')
                         .replace(/<button[^>]*data-tooltip-id[^>]*>[\s\S]*?<\/button>/g, '')
                         .replace(/<span[^>]*class="[^"]*google-symbols[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
                         .replace(/\bcontent_copy\b/g, '')
                         .replace(/\bthumb_up\b/g, '')
                         .replace(/\bthumb_down\b/g, '');
        }
        return formatMarkdown(m.content);
    };

    if (msg.role === 'user') {
        return `<div class="msg-label">You</div><div class="msg-body">${formatMarkdown(msg.content)}</div>`;
    } else if (msg.type === 'taskBlock') {
        let html = '';
        if (msg.title) html += `<div class="task-title">🎯 ${escapeHtml(msg.title)}</div>`;
        
        const cleanStatuses = (msg.allStatuses || []).filter(isCleanStatus);
        const paragraphHtml = (msg.html || msg.content) ? `<div class="task-paragraph">${renderContent(msg)}</div>` : '';
        
        if (cleanStatuses.length > 0) {
            html += '<div class="task-steps">';
            cleanStatuses.forEach((s, i) => {
                html += `<div class="task-step"><span class="step-num">${i + 1}</span><span class="step-text">${formatMarkdown(s, true)}</span></div>`;
            });
            html += '</div>';
        }
        html += paragraphHtml;
        
        return html;
    } else {
        return `<div class="msg-label">Agent</div><div class="msg-body">${renderContent(msg)}</div>`;
    }
}

/**
 * Filter out noise from allStatuses (frontend-side double-check)
 */
function isCleanStatus(s) {
    if (!s || s.length < 5) return false;
    if (s.includes('> ') && s.includes('node ')) return false;
    if (s.includes('Client connected') || s.includes('Client disconnected')) return false;
    if (s.includes('\\') && !s.includes(' ')) return false;
    if (/^…?\\/.test(s)) return false;
    if (s.startsWith('Running command')) return false;
    return true;
}

/**
 * Format markdown using marked.js if available, fallback to basic formatting
 */
function formatMarkdown(text, inline = false) {
    if (!text) return '';
    try {
        if (typeof marked !== 'undefined') {
            return inline ? marked.parseInline(text) : marked.parse(text);
        }
    } catch(e) {}
    
    // Fallback format
    const escaped = escapeHtml(text);
    if (inline) return escaped;
    return escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/`([^`]+)`/g, '<code>$1</code>');
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
 * Show/hide streaming indicator via CSS transition (no DOM destruction)
 */
function updateStreamingIndicator(isStreaming) {
    let indicator = document.getElementById('streamingIndicator');
    if (!indicator && elements.chatContent) {
        indicator = document.createElement('div');
        indicator.id = 'streamingIndicator';
        indicator.className = 'streaming-indicator';
        indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        elements.chatContent.appendChild(indicator);
    }
    
    if (indicator) {
        if (isStreaming) {
            indicator.classList.add('active');
            // Only move to end if it's not already the last child
            if (indicator.parentNode !== elements.chatContent || indicator !== elements.chatContent.lastElementChild) {
                elements.chatContent?.appendChild(indicator);
            }
        } else {
            indicator.classList.remove('active');
        }
    }
}

/**
 * LEGACY: renderSnapshot for backward compatibility with WS updates
 */
export function renderSnapshot(data) {
    if (data?.messages && data.messages[0]?.type) {
        return renderChatState(data);
    }
    
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
