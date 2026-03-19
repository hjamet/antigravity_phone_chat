/**
 * Chat History Management
 */

import { fetchWithAuth } from './api.js';
import { elements, toggleModal } from './ui.js';

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
    
    // Group by workspace
    const groups = {};
    chats.forEach(chat => {
        if (!groups[chat.workspace]) groups[chat.workspace] = [];
        groups[chat.workspace].push(chat);
    });

    Object.keys(groups).forEach(wsName => {
        const groupEl = document.createElement('div');
        groupEl.className = 'history-group';
        groupEl.innerHTML = `<div class="group-header">${wsName}</div>`;
        
        groups[wsName].forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.isActive ? 'active' : ''}`;
            item.innerHTML = `
                <div class="chat-info">
                    <div class="chat-title">${chat.title}</div>
                    <div class="chat-time">${chat.time}</div>
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
    toggleModal('history-modal', false);
    try {
        await fetchWithAuth('/select-chat', {
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
    try {
        await fetchWithAuth('/new-chat', { method: 'POST' });
    } catch (e) {
        console.error('New chat error:', e);
    }
}
