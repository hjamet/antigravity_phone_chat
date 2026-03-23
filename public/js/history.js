/**
 * Chat History Management
 */

import { fetchWithAuth } from './api.js';
import { elements, toggleLayer } from './ui.js';

/**
 * Load and display chat history
 */
export async function loadHistory() {
    try {
        const res = await fetchWithAuth('/chat-history');
        const data = await res.json();
        
        if (data.success && data.chats) {
            renderHistory(data.chats);
        }
    } catch (e) {
        console.error('History load error:', e);
    }
}

/**
 * Parse relative time string (e.g. "now", "5m", "2h", "1d", "3w") to minutes for sorting.
 * Lower value = more recent.
 */
function parseTimeToMinutes(timeStr) {
    if (!timeStr || timeStr === 'Recent' || timeStr === 'now') return 0;
    const match = timeStr.match(/^(\d+)([mhdw])$/);
    if (!match) return 9999;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'm') return val;
    if (unit === 'h') return val * 60;
    if (unit === 'd') return val * 1440;
    if (unit === 'w') return val * 10080;
    return 9999;
}

/**
 * Extract short project name from workspace path (last folder segment)
 */
function shortProjectName(workspace) {
    if (!workspace || workspace === 'Other') return 'Other';
    const parts = workspace.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || workspace;
}

/**
 * Render history list into the DOM — sorted by recency, with project badge
 */
function renderHistory(chats) {
    const container = elements.historyList;
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!chats || chats.length === 0) {
        container.innerHTML = `
            <div class="history-state-container">
                <div class="history-state-icon">📭</div>
                <div class="history-state-title">No Conversations</div>
                <div class="history-state-desc">Start a new chat to see your history here.</div>
            </div>`;
        return;
    }

    // Action button at top
    const actionContainer = document.createElement('div');
    actionContainer.className = 'history-action-container';
    actionContainer.innerHTML = `
        <button class="history-new-btn" onclick="startNewChat()">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Conversation
        </button>
    `;
    container.appendChild(actionContainer);

    // Sort all chats by recency (most recent first)
    const sorted = [...chats].sort((a, b) => {
        // Active chats always on top
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

    // Flat list container
    const listEl = document.createElement('div');
    listEl.className = 'history-list-group';

    sorted.forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-card ${chat.isActive ? 'active' : ''}`;
        
        let iconCode;
        if (chat.isActive) {
            iconCode = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" class="spin-anim" style="color: var(--accent);"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`;
        } else if (chat.isFinished) {
            iconCode = `<div class="history-card-unread-dot" title="Non lu"></div>`;
        } else {
            iconCode = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" style="opacity: 0.7;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
        }

        const projectLabel = shortProjectName(chat.workspace);
            
        item.innerHTML = `
            <div class="history-card-icon">
                ${iconCode}
            </div>
            <div class="history-card-content">
                <span class="history-card-title">${chat.title}</span>
                <span class="history-card-time">${chat.time || 'Recent'}</span>
            </div>
            <div class="history-card-project-badge" title="${chat.workspace || 'Other'}">${projectLabel}</div>
            <div class="history-card-arrow">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;
        item.onclick = () => window.selectChat ? window.selectChat(chat.title) : selectChat(chat.title);
        listEl.appendChild(item);
    });
    
    container.appendChild(listEl);
}

/**
 * Select a chat from history
 */
export async function selectChat(title) {
    // Mark as read is handled by main.js (window.selectChat -> markChatRead)
    toggleLayer(elements.historyLayer, false);
    try {
        const res = await fetchWithAuth('/select-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
    } catch (e) {
        console.error('Select chat error:', e);
    }
}

/**
 * Start a new chat
 */
export async function startNewChat() {
    toggleLayer(elements.historyLayer, false);
    try {
        const res = await fetchWithAuth('/new-chat', { method: 'POST' });
        const data = await res.json();
        if (data.error) {
            console.error('New chat error:', data.error);
            alert(data.error);
            return;
        }
        // Reset the frontend UI for a fresh conversation
        window.dispatchEvent(new CustomEvent('new-chat-started'));
    } catch (e) {
        console.error('New chat error:', e);
    }
}
