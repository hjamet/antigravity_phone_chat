/**
 * Main Application Entry Point
 */

import { initWS, sendWS } from './ws.js';
import { elements, renderSnapshot, updateStateUI, toggleLayer } from './ui.js';
import { sendMessage, stopGeneration, scrollToBottom } from './chat.js';
import { loadHistory, startNewChat } from './history.js';
import { loadProjects } from './projects.js';
import { fetchWithAuth } from './api.js';

// Global state
let currentFrame = null;

/**
 * Handle incoming snapshot data (from any source)
 */
function handleSnapshot(data) {
    currentFrame = renderSnapshot(data);
    if (currentFrame) scrollToBottom(currentFrame);
}

/**
 * Fetch snapshot directly from API with retry
 */
async function fetchSnapshotDirect(retries = 5, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetchWithAuth(`/snapshot?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.html) {
                    handleSnapshot(data);
                    console.log('✅ Snapshot loaded via direct fetch');
                    return true;
                }
            }
        } catch (e) {}
        // Wait before retry (exponential backoff)
        await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
    console.warn('⚠️ Could not fetch snapshot after retries');
    return false;
}

/**
 * Initialize the application
 */
async function init() {
    console.log('🚀 Antigravity Phone Connect Initializing...');

    // 1. Initialize WebSocket (for live updates)
    initWS((message) => {
        if (message.type === 'snapshot') {
            handleSnapshot(message.data);
        } else if (message.type === 'state') {
            updateStateUI(message.data);
        }
    });

    // 2. Direct initial snapshot fetch (don't rely on WebSocket alone)
    fetchSnapshotDirect();

    // 3. Attach Event Listeners
    elements.sendBtn?.addEventListener('click', () => sendMessage(elements.chatInput.value));
    
    elements.chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(elements.chatInput.value);
        }
    });

    elements.stopBtn?.addEventListener('click', stopGeneration);

    document.getElementById('newChatBtn')?.addEventListener('click', startNewChat);
    document.getElementById('historyBtn')?.addEventListener('click', () => {
        loadHistory();
        toggleLayer(elements.historyLayer, true);
    });
    
    // Project handles
    document.getElementById('projectSelectorBtn')?.addEventListener('click', () => {
        loadProjects();
        toggleLayer(elements.projectsLayer, true);
    });

    // Listen for snapshot-update custom events (from history.js when selecting a chat)
    window.addEventListener('snapshot-update', (e) => {
        if (e.detail) handleSnapshot(e.detail);
    });

    // Global Close handlers for HTML onclick compatibility
    window.hideChatHistory = () => toggleLayer(elements.historyLayer, false);
    window.hideProjects = () => toggleLayer(elements.projectsLayer, false);
    window.closeModal = () => toggleLayer(document.getElementById('modalOverlay'), false);
    window.startNewChat = startNewChat;
    window.selectChat = (title) => {
        window.hideChatHistory();
        import('./history.js').then(m => m.selectChat(title));
    };

    // SSL banner: hide via Cloudflare (HTTPS is managed externally)
    if (elements.sslBanner) {
        elements.sslBanner.style.display = 'none';
    }

    // Projects Helpers
    window.openNewWorkspace = async () => {
        try {
            await fetchWithAuth('/api/workspace/open', { method: 'POST' });
            window.hideProjects();
        } catch (e) {}
    };

    // Initial state fetch
    syncState();
    setInterval(syncState, 5000);
}

/**
 * Periodically sync state from server
 */
async function syncState() {
    try {
        const res = await fetchWithAuth('/app-state');
        const state = await res.json();
        updateStateUI(state);
    } catch (e) {}
}

// Visual Viewport Handling for Mobile Keyboards
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        document.body.style.height = window.visualViewport.height + 'px';
        if (document.activeElement === elements.chatInput && currentFrame) {
            setTimeout(() => scrollToBottom(currentFrame), 100);
        }
    });
}

// Remote Click handling
elements.chatContainer?.addEventListener('click', async (e) => {
    const target = e.target.closest('div, span, p, summary, button');
    if (!target) return;

    const text = target.innerText || '';
    const isThoughtToggle = /Thought|Thinking/i.test(text) && text.length < 500;

    if (isThoughtToggle) {
        const firstLine = text.split('\n')[0].trim();
        await fetchWithAuth('/remote-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selector: target.tagName.toLowerCase(),
                index: 0,
                textContent: firstLine
            })
        });
    }
});

// Start the app
init();
