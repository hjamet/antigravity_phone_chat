/**
 * Main Application Entry Point
 */

import { initWS, sendWS } from './ws.js';
import { elements, renderSnapshot, updateStateUI, toggleLayer } from './ui.js';
import { sendMessage, stopGeneration, scrollToBottom } from './chat.js';
import { loadHistory, startNewChat } from './history.js';
import { loadProjects } from './projects.js';
import { fetchWithAuth, getSSLStatus } from './api.js';

// Global state
let currentFrame = null;

/**
 * Initialize the application
 */
async function init() {
    console.log('🚀 Antigravity Phone Connect Initializing...');

    // 1. Initialize WebSocket
    initWS((message) => {
        if (message.type === 'snapshot') {
            currentFrame = renderSnapshot(message.data);
            if (currentFrame) scrollToBottom(currentFrame);
        } else if (message.type === 'state') {
            updateStateUI(message.data);
        }
    });

    // 2. Attach Event Listeners
    elements.sendBtn.addEventListener('click', () => sendMessage(elements.chatInput.value));
    
    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(elements.chatInput.value);
        }
    });

    elements.stopBtn.addEventListener('click', stopGeneration);

    document.getElementById('newChatBtn').addEventListener('click', startNewChat);
    document.getElementById('historyBtn').addEventListener('click', () => {
        loadHistory();
        toggleLayer(elements.historyLayer, true);
    });
    
    // Project handles
    document.getElementById('projectSelectorBtn').addEventListener('click', () => {
        loadProjects();
        toggleLayer(elements.projectsLayer, true);
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

    // SSL Helpers
    window.enableHttps = () => {
        if (window.location.protocol !== 'https:') {
            window.location.href = window.location.href.replace('http:', 'https:');
        }
    };
    window.dismissSslBanner = () => {
        if (elements.sslBanner) elements.sslBanner.style.display = 'none';
    };

    // Projects Helpers
    window.openNewWorkspace = async () => {
        try {
            await fetchWithAuth('/new-workspace', { method: 'POST' });
            window.hideProjects();
        } catch (e) {}
    };

    // 3. Initial Sync
    const ssl = await getSSLStatus();
    if (elements.sslBanner) {
        elements.sslBanner.style.display = ssl.isSecure ? 'none' : 'flex';
    }

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
elements.chatContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('div, span, p, summary, button');
    if (!target) return;

    const text = target.innerText || '';
    const isThoughtToggle = /Thought|Thinking/i.test(text) && text.length < 500;

    if (isThoughtToggle) {
        const firstLine = text.split('\n')[0].trim();
        // Index discovery logic here... (Simplified for now, can be improved)
        await fetchWithAuth('/remote-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selector: target.tagName.toLowerCase(),
                index: 0, // Should be calculated if multiple exist
                textContent: firstLine
            })
        });
    }
});

// Start the app
init();
