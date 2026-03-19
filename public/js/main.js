/**
 * Main Application Entry Point
 */

import { initWS } from './ws.js';
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
                if (data && (data.messages || data.html)) {
                    handleSnapshot(data);
                    console.log('✅ Snapshot loaded via direct fetch');
                    return true;
                }
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
    console.warn('⚠️ Could not fetch snapshot after retries');
    return false;
}

/**
 * Show a dropdown menu near a button
 */
function showDropdown(anchorEl, options, currentValue, onSelect) {
    // Remove any existing dropdown
    document.querySelectorAll('.dropdown-menu').forEach(el => el.remove());
    
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu show';
    
    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = `dropdown-item ${opt === currentValue ? 'active' : ''}`;
        item.textContent = opt;
        item.onclick = () => {
            onSelect(opt);
            menu.remove();
        };
        menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    
    // Position near the anchor button
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    
    // Close on click outside
    setTimeout(() => {
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        document.addEventListener('click', close);
    }, 10);
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

    // 2. Direct initial snapshot fetch
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

    document.getElementById('newChatBtn')?.addEventListener('click', async () => {
        await startNewChat();
        // Refresh snapshot after creating new chat
        setTimeout(() => fetchSnapshotDirect(2, 500), 500);
    });
    
    document.getElementById('historyBtn')?.addEventListener('click', () => {
        loadHistory();
        toggleLayer(elements.historyLayer, true);
    });
    
    // Remote Scroll controls (Touch & Wheel)
    let lastScrollY = 0;
    let scrollTimeout = null;

    const handleRemoteScroll = (deltaY) => {
        if (Math.abs(deltaY) < 10) return;
        
        if (scrollTimeout) clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            fetchWithAuth('/remote-scroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deltaY })
            }).then(() => fetchSnapshotDirect(1, 20)).catch(()=>{});
            scrollTimeout = null;
        }, 80); // 80ms throttle for smooth but responsive remote scroll
    };

    if (elements.chatContent) {
        elements.chatContent.addEventListener('wheel', (e) => {
            // Check if we are at boundary of local scroll before remote scrolling
            const isAtTop = elements.chatContent.scrollTop <= 0;
            const isAtBottom = elements.chatContent.scrollHeight - elements.chatContent.scrollTop <= elements.chatContent.clientHeight + 1;
            
            if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                handleRemoteScroll(e.deltaY);
            }
        }, { passive: true });

        elements.chatContent.addEventListener('touchstart', (e) => {
            lastScrollY = e.touches[0].clientY;
        }, { passive: true });

        elements.chatContent.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const deltaY = lastScrollY - currentY;
            
            const isAtTop = elements.chatContent.scrollTop <= 0;
            const isAtBottom = Math.ceil(elements.chatContent.scrollTop + elements.chatContent.clientHeight) >= elements.chatContent.scrollHeight;

            if ((deltaY < 0 && isAtTop) || (deltaY > 0 && isAtBottom)) {
                if (Math.abs(deltaY) > 15) {
                    handleRemoteScroll(deltaY * 3); // Multiplier for faster scroll feeling
                    lastScrollY = currentY;
                }
            }
        }, { passive: true });
    }
    });
    
    // Project handles
    document.getElementById('projectSelectorBtn')?.addEventListener('click', () => {
        loadProjects();
        toggleLayer(elements.projectsLayer, true);
    });

    // Mode selector dropdown
    elements.modeBtn?.addEventListener('click', () => {
        const currentMode = elements.modeText?.textContent || 'Planning';
        showDropdown(elements.modeBtn, ['Planning', 'Fast'], currentMode, async (mode) => {
            try {
                await fetchWithAuth('/set-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode })
                });
                if (elements.modeText) elements.modeText.textContent = mode;
            } catch(e) { console.error('Set mode error:', e); }
        });
    });

    // Model selector dropdown (reads real models from Manager)
    elements.modelBtn?.addEventListener('click', async () => {
        const currentModel = elements.modelText?.textContent || '';
        
        // Show loading state
        const btn = elements.modelBtn;
        const origText = btn?.querySelector('#modelText')?.textContent;
        if (btn) btn.style.opacity = '0.6';
        
        // Fetch available models dynamically from Manager DOM
        let models = [];
        try {
            const res = await fetchWithAuth('/available-models');
            const data = await res.json();
            if (data.models && data.models.length > 0) models = data.models;
        } catch(e) { console.error('Fetch models error:', e); }
        
        if (btn) btn.style.opacity = '1';
        
        if (models.length === 0) {
            console.warn('No models found from Manager');
            return;
        }
        
        showDropdown(elements.modelBtn, models, currentModel, async (model) => {
            try {
                const res = await fetchWithAuth('/set-model', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model })
                });
                const result = await res.json();
                if (result.success || !result.error) {
                    if (elements.modelText) elements.modelText.textContent = model;
                }
            } catch(e) { console.error('Set model error:', e); }
        });
    });

    // Listen for snapshot-update custom events
    window.addEventListener('snapshot-update', (e) => {
        if (e.detail) handleSnapshot(e.detail);
    });

    // Global Close handlers
    window.hideChatHistory = () => toggleLayer(elements.historyLayer, false);
    window.hideProjects = () => toggleLayer(elements.projectsLayer, false);
    window.closeModal = () => toggleLayer(document.getElementById('modalOverlay'), false);
    window.startNewChat = startNewChat;
    window.selectChat = async (title) => {
        window.hideChatHistory();
        const { selectChat } = await import('./history.js');
        await selectChat(title);
        // Force a snapshot refresh after switching conversations
        setTimeout(() => fetchSnapshotDirect(3, 800), 1500);
    };

    // SSL banner: hide (HTTPS managed by Cloudflare)
    if (elements.sslBanner) elements.sslBanner.style.display = 'none';

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

// Visual Viewport for mobile keyboards
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        document.body.style.height = window.visualViewport.height + 'px';
        if (document.activeElement === elements.chatInput && currentFrame) {
            setTimeout(() => scrollToBottom(currentFrame), 100);
        }
    });
}

// Start
init();
