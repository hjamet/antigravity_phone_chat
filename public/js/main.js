/**
 * Main Application Entry Point
 * Phase 5: Polls /api/chat-state every second as primary update mechanism
 */

import { initWS } from './ws.js?v=10';
import { elements, renderChatState, renderSnapshot, updateStateUI, toggleLayer } from './ui.js?v=10';
import { sendMessage, stopGeneration, scrollToBottom } from './chat.js?v=10';
import { loadHistory, startNewChat } from './history.js?v=10';
import { loadProjects } from './projects.js?v=10';
import { fetchWithAuth } from './api.js?v=10';
import { initPicker, onTriggerChar, hidePicker, isPickerVisible, getWorkflowPrefix, clearWorkflow } from './picker.js?v=11';

/**
 * Poll /api/chat-state and render.
 * Caches the raw JSON string — if identical to last poll, renderChatState is NOT called at all.
 * This prevents any DOM work (querySelector, hash computation, streaming indicator, etc.)
 * when the backend has nothing new, which eliminates flickering completely.
 */
let _lastPollJson = '';

async function pollChatState() {
    try {
        const res = await fetchWithAuth(`/api/chat-state?t=${Date.now()}`);
        const text = await res.text();
        
        // Skip rendering entirely if response is identical
        if (text === _lastPollJson) return;
        _lastPollJson = text;
        
        const data = JSON.parse(text);
        if (data && !data.error) {
            renderChatState(data);
            if (!data.isStreaming) window.dispatchEvent(new Event('agent-stopped-streaming'));
        }
    } catch (e) {
        // Server unreachable — silent fail, will retry next tick
    }
}

/**
 * Show a dropdown menu near a button
 */
function showDropdown(anchorEl, options, currentValue, onSelect) {
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
    
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.top = `${rect.bottom + 8}px`;
    
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

    // 1. Initialize WebSocket (for push-based live updates when available)
    initWS((message) => {
        if (message.type === 'snapshot') {
            renderSnapshot(message.data);
        } else if (message.type === 'state') {
            updateStateUI(message.data);
        }
    });

    // 2. Initial chat state fetch
    pollChatState();

    // 3. Start 1-second polling loop (primary update mechanism)
    setInterval(pollChatState, 1000);

    // 4. Attach Event Listeners
    elements.sendBtn?.addEventListener('click', () => {
        if (window.isAgentStreaming) {
            import('./chat.js?v=10').then(m => m.stopGeneration());
        } else {
            const prefix = getWorkflowPrefix();
            const text = elements.chatInput.value;
            import('./chat.js?v=10').then(m => m.sendMessage(prefix + text));
            clearWorkflow();
        }
    });
    
    elements.chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isPickerVisible()) {
                hidePicker();
                return;
            }
            // Prepend workflow prefix if a workflow badge is active
            const prefix = getWorkflowPrefix();
            const text = elements.chatInput.value;
            sendMessage(prefix + text);
            clearWorkflow();
        }
        // Detect "/" for workflow picker trigger (only when input is empty)
        if (e.key === '/') {
            const val = elements.chatInput.value;
            if (val.trim() === '') {
                e.preventDefault();
                elements.chatInput.value = '';
                onTriggerChar();
            }
        }
        // Escape closes picker
        if (e.key === 'Escape' && isPickerVisible()) {
            hidePicker();
        }
    });

    elements.chatInput?.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px'; // Max height limit 150px
    });



    document.getElementById('newChatBtn')?.addEventListener('click', async () => {
        await startNewChat();
        setTimeout(pollChatState, 500);
    });
    
    document.getElementById('historyBtn')?.addEventListener('click', async () => {
        toggleLayer(elements.historyLayer, true);
        await loadHistory();
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
            }).then(() => pollChatState()).catch(()=>{});
            scrollTimeout = null;
        }, 80);
    };

    if (elements.chatContent) {
        elements.chatContent.addEventListener('wheel', (e) => {
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
                    handleRemoteScroll(deltaY * 3);
                    lastScrollY = currentY;
                }
            }
        }, { passive: true });
    }

    // Project selector
    document.getElementById('projectSelectorBtn')?.addEventListener('click', async () => {
        toggleLayer(elements.projectsLayer, true);
        await loadProjects();
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

    // Model selector dropdown
    elements.modelBtn?.addEventListener('click', async () => {
        const currentModel = elements.modelText?.textContent || '';
        const btn = elements.modelBtn;
        if (btn) btn.style.opacity = '0.6';
        
        let models = [];
        try {
            const res = await fetchWithAuth('/available-models');
            const data = await res.json();
            if (data.models && data.models.length > 0) models = data.models;
        } catch(e) {}
        
        if (btn) btn.style.opacity = '1';
        if (models.length === 0) return;
        
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
            } catch(e) {}
        });
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
        setTimeout(pollChatState, 1500);
    };

    if (elements.sslBanner) elements.sslBanner.style.display = 'none';

    window.openNewWorkspace = async () => {
        try {
            await fetchWithAuth('/api/workspace/open', { method: 'POST' });
            window.hideProjects();
        } catch (e) {}
    };

    // State sync (mode, model, workspace)
    syncState();
    setInterval(syncState, 5000);

    // Initialize picker
    initPicker();
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
    });
}

// Start
init();
