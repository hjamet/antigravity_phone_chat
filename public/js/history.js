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
 * Render history list into the DOM
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

    // Group by workspace
    const groups = {};
    chats.forEach(chat => {
        const ws = chat.workspace || 'Other';
        if (!groups[ws]) groups[ws] = [];
        groups[ws].push(chat);
    });

    Object.keys(groups).forEach(wsName => {
        const groupEl = document.createElement('div');
        groupEl.className = 'history-list-group';
        groupEl.innerHTML = `<div class="history-workspace-header">${wsName}</div>`;
        
        groups[wsName].forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-card ${chat.isActive ? 'active' : ''}`;
            
            let iconCode = chat.isActive 
                ? `<div class="history-card-active-dot"></div><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none" class="spin-anim"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>`
                : `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
                
            item.innerHTML = `
                <div class="history-card-icon">
                    ${iconCode}
                </div>
                <div class="history-card-content">
                    <span class="history-card-title">${chat.title}</span>
                    <span class="history-card-time">${chat.time || 'Recent'}</span>
                </div>
                <div class="history-card-arrow">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            `;
            item.onclick = () => selectChat(chat.title);
            groupEl.appendChild(item);
        });
        
        container.appendChild(groupEl);
    });
}

/**
 * Select a chat from history
 */
export async function selectChat(title) {
    toggleLayer(elements.historyLayer, false);
    try {
        const res = await fetchWithAuth('/select-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        // Force a snapshot refresh after selecting a chat
        setTimeout(async () => {
            try {
                const snapRes = await fetchWithAuth(`/snapshot?t=${Date.now()}`);
                const data = await snapRes.json();
                if (data && !data.error) {
                    window.dispatchEvent(new CustomEvent('snapshot-update', { detail: data }));
                }
            } catch(e) {}
        }, 1000);
    } catch (e) {
        console.error('Select chat error:', e);
    }
}

/**
 * Start a new chat
 */
export async function startNewChat() {
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
