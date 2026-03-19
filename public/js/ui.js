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
 * Shows structured messages: user, mainParagraph (prominent), progressTitles (compact), directMessage
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

    // Get user message from localStorage (source of truth) or snapshot
    const savedUserMsg = localStorage.getItem('lastUserMessage') || '';

    // displayMsgs represents the unified timeline sent by server
    const displayMsgs = [...messages];
    
    // Fallback: if no user in list but we have one in localStorage, add it
    if (!displayMsgs.some(m => m.role === 'user') && savedUserMsg) {
        displayMsgs.unshift({ role: 'user', type: 'message', content: savedUserMsg });
    }

    // Build a hash to detect changes
    const hash = displayMsgs.map(m => (m.type || '') + ':' + (m.content?.substring(0, 30) || (m.steps ? JSON.stringify(m.steps).substring(0, 30) : '') )).join('|');
    
    const container = elements.chatContent;
    if (!container) return;
    
    // Only re-render if content changed
    if (hash !== lastRenderedHash) {
        lastRenderedHash = hash;
        container.innerHTML = '';
        
        for (const msg of displayMsgs) {
            container.appendChild(createMessageBubble(msg));
        }
    }
    
    // Show streaming indicator
    updateStreamingIndicator(data.isStreaming);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    return container;
}

/**
 * Create a chat message bubble based on type
 */
function createMessageBubble(msg) {
    const div = document.createElement('div');
    const role = msg.role;
    const type = msg.type || 'message';
    
    if (role === 'user') {
        div.className = 'chat-bubble user';
        const roleLabel = document.createElement('div');
        roleLabel.className = 'msg-role';
        roleLabel.textContent = '👤 You';
        const content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = formatContent(msg);
        div.appendChild(roleLabel);
        div.appendChild(content);
    } else if (type === 'taskBlock') {
        // Hierarchical task display showing the current summary and accumulated steps
        div.className = 'chat-bubble agent main-paragraph';
        
        let contentHtml = '';
        
        // 1. Show the main task title
        if (msg.taskTitle) {
            contentHtml += `<h3 class="group-task-title" style="margin-top: 5px; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; font-size: 1.1em;">🎯 ${msg.taskTitle}</h3>`;
        }
        
        // 2. Render the top-level current task summary (which replaces old ones)
        if (msg.taskSummary) {
            contentHtml += `<div class="msg-content task-step-summary" style="margin-bottom: 12px;">${formatContent({ content: msg.taskSummary })}</div>`;
        }
        
        // 3. Render the list of accumulated TaskStatus steps below the summary
        if (msg.allStatuses && msg.allStatuses.length > 0) {
            msg.allStatuses.forEach((status, idx) => {
                if (status) {
                    contentHtml += `<div class="task-step-title" style="font-weight: 600; margin-bottom: 4px; margin-top: 8px; color: var(--accent-light); font-size: 0.95em;">## ${idx + 1}. ${status}</div>`;
                }
            });
        }
        
        div.innerHTML = contentHtml;
    } else if (type === 'progressTitles') {
        // Compact progress titles
        div.className = 'chat-bubble agent progress-titles';
        if (msg.taskTitle) {
            const taskLabel = document.createElement('div');
            taskLabel.className = 'msg-task-title compact';
            taskLabel.textContent = '⚙️ ' + msg.taskTitle;
            div.appendChild(taskLabel);
        }
        const list = document.createElement('ul');
        list.className = 'progress-list';
        const titles = msg.titles || msg.content.split('\n');
        for (const t of titles.slice(-5)) { // Only show last 5
            const li = document.createElement('li');
            li.textContent = t;
            list.appendChild(li);
        }
        div.appendChild(list);
    } else {
        // Direct message or generic
        div.className = 'chat-bubble agent';
        const roleLabel = document.createElement('div');
        roleLabel.className = 'msg-role';
        roleLabel.textContent = '🤖 Agent';
        const content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = formatContent(msg);
        div.appendChild(roleLabel);
        div.appendChild(content);
    }
    
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
    // Update project selector status label (fixes stuck "Connecting...")
    const projectStatus = document.getElementById('currentProjectStatus');
    if (projectStatus) {
        projectStatus.textContent = state.workspace ? 'Connected' : 'Online';
    }
    // Update stats text (fixes stuck "Syncing...")
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
