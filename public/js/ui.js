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
    workflowBtn: document.getElementById('workflowBtn'),
    stopBtn: document.getElementById('stopBtn'),
    historyList: document.getElementById('historyList'),
    projectList: document.getElementById('projectsList'),
    modeText: document.getElementById('modeText'),
    modelText: document.getElementById('modelText'),
    modeBtn: document.getElementById('modeBtn'),
    modelBtn: document.getElementById('modelBtn'),
    ttsBtn: document.getElementById('ttsBtn'),
    ttsIconOn: document.getElementById('ttsIconOn'),
    ttsIconOff: document.getElementById('ttsIconOff'),
    ttsText: document.getElementById('ttsText'),
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
    
    const pendingMsg = window.pendingUserMessage;
    if (pendingMsg) {
        const serverUserMsgs = messages.filter(m => m.role === 'user');
        const lastServerUserMsg = serverUserMsgs.length > 0 ? serverUserMsgs[serverUserMsgs.length - 1] : null;

        const strMatch = (a, b) => {
            const cleanA = (a || '').replace(/\\s+/g, '').toLowerCase();
            const cleanB = (b || '').replace(/\\s+/g, '').toLowerCase();
            return cleanA && cleanB && (cleanA.includes(cleanB.substring(0, 15)) || cleanB.includes(cleanA.substring(0, 15)));
        };

        if (lastServerUserMsg && strMatch(lastServerUserMsg.content, pendingMsg)) {
            window.pendingUserMessage = undefined;
        } else {
            messages.push({ 
                role: 'user', 
                type: 'message', 
                content: window.isAgentStreaming ? `${pendingMsg} ⏳` : pendingMsg 
            });
        }
    }
    
    // Check if user is near the bottom using the actual scrollable container
    const scrollEl = elements.chatContainer;
    const isNearBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 150;
    const isFirstLoad = existing.length === 0 && messages.length > 0;
    
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

    // Artifact quick-access bar
    updateArtifactBar(state.availableArtifacts || []);

    // Only auto-scroll if something changed AND user was near the bottom (or first load)
    if (anyChanged && (isNearBottom || isFirstLoad)) {
        requestAnimationFrame(() => {
            scrollEl.scrollTo({ 
                top: scrollEl.scrollHeight, 
                behavior: isFirstLoad ? 'auto' : 'smooth' 
            });
        });
    }
    
    return container;
}

/**
 * Show/hide the artifact quick-access bar at the bottom of the chat
 */
function updateArtifactBar(artifacts) {
    let bar = document.getElementById('artifactBar');
    
    if (!artifacts || artifacts.length === 0) {
        if (bar) bar.remove();
        return;
    }

    const key = artifacts.join(',');
    if (bar && bar.getAttribute('data-key') === key) return; // No change

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'artifactBar';
        bar.className = 'artifact-bar';
        // Insert before the input area (after chatContainer)
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.parentElement.insertBefore(bar, chatContainer.nextSibling);
        }
    }

    bar.setAttribute('data-key', key);
    bar.innerHTML = artifacts.map(name => {
        const encoded = encodeURIComponent(name);
        return `<button class="artifact-bar-btn" onclick="window._openArtifact && window._openArtifact('${encoded}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${escapeHtml(name)}</span>
        </button>`;
    }).join('');
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
        (msg.artifactRefs || []).join(','),
    ].join(':');
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
    }
    return hash.toString();
}

/**
 * Build inline artifact reference cards HTML
 */
function buildArtifactRefsHtml(refs) {
    if (!refs || refs.length === 0) return '';
    const unique = [...new Set(refs)];
    return '<div class="artifact-refs">' + unique.map(name => {
        const safeName = escapeHtml(name);
        const encodedName = encodeURIComponent(name);
        return `<button class="artifact-ref-btn" onclick="window._openArtifact && window._openArtifact('${encodedName}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${safeName}</span>
            <span class="artifact-ref-action">Open</span>
        </button>`;
    }).join('') + '</div>';
}

/**
 * Build the INNER HTML of a message div.
 */
function buildMessageInner(msg) {
    const renderContent = (m) => {
        if (m.html) {
            return m.html
                // Strip all <style> blocks
                .replace(/<style[\s\S]*?<\/style>/g, '')
                // Strip code block action bars (copy, mention buttons container)
                .replace(/<div[^>]*class="[^"]*code-block-actions[^"]*"[^>]*>[\s\S]*?<\/div>/g, '')
                // Strip all <button> elements (action buttons, tooltips)
                .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
                // Strip small file extension icon images from Antigravity
                .replace(/<img[^>]*>/g, '')
                // Strip Google Material Symbols icon spans
                .replace(/<span[^>]*class="[^"]*google-symbols[^"]*"[^>]*>[\s\S]*?<\/span>/g, '')
                // Strip SVG elements (inline icons inside buttons)
                .replace(/<svg[^>]*>[\s\S]*?<\/svg>/g, '')
                // Clean leftover icon text keywords
                .replace(/\bcontent_copy\b/g, '')
                .replace(/\bthumb_up\b/g, '')
                .replace(/\bthumb_down\b/g, '')
                .replace(/\b@\b/g, '');
        }
        return formatMarkdown(m.content);
    };

    const refsHtml = buildArtifactRefsHtml(msg.artifactRefs);

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
        html += refsHtml;
        
        return html;
    } else {
        return `<div class="msg-label">Agent</div><div class="msg-body">${renderContent(msg)}</div>${refsHtml}`;
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

    // Toggle Send/Stop button state
    if (elements.sendBtn) {
        if (isStreaming) {
            elements.sendBtn.classList.add('is-stopping');
            elements.sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="stop-icon">
                    <rect x="6" y="6" width="12" height="12"></rect>
                </svg>
            `;
        } else {
            elements.sendBtn.classList.remove('is-stopping');
            elements.sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            `;
            elements.sendBtn.disabled = false;
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
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        if (state.workspace && state.chatTitle) {
            headerTitle.textContent = `${state.workspace} - ${state.chatTitle}`;
        } else if (state.workspace) {
            headerTitle.textContent = state.workspace;
        } else {
            headerTitle.textContent = 'Antigravity Connect';
        }
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
