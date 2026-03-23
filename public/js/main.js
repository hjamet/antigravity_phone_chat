/**
 * Main Application Entry Point
 * Phase 5: Polls /api/chat-state every second as primary update mechanism
 */

import { initWS } from './ws.js?v=11';
import { elements, renderChatState, renderSnapshot, updateStateUI, toggleLayer } from './ui.js?v=11';
import { sendMessage, stopGeneration, scrollToBottom } from './chat.js?v=10';
import { loadHistory, startNewChat } from './history.js?v=12';
import { loadProjects } from './projects.js?v=10';
import { fetchWithAuth } from './api.js?v=10';
import { initPicker, onTriggerChar, hidePicker, isPickerVisible, getWorkflowPrefix, clearWorkflow } from './picker.js?v=12';
import { loadArtifacts, initArtifacts, flushDraftComments } from './artifacts.js?v=3';
import { handleSelectorError } from './selectorError.js?v=1';

/**
 * Poll /api/chat-state and render.
 * Caches the raw JSON string — if identical to last poll, renderChatState is NOT called at all.
 * This prevents any DOM work (querySelector, hash computation, streaming indicator, etc.)
 * when the backend has nothing new, which eliminates flickering completely.
 */
let _lastPollJson = '';
let _wasConversationFinished = false;
let _wasStreaming = false;
let _isTtsEnabled = localStorage.getItem('antigravity_tts') !== 'false';

let _lastFinalMessageText = '';
window._replayLastTTS = () => {
    if (_lastFinalMessageText) playTTS(_lastFinalMessageText);
};

/**
 * Read text using Web Speech API TTS
 */
function playTTS(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    // Clean markdown before speaking
    const cleanText = text
        .replace(/```[\s\S]*?```/g, 'Bloc de code.')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[#*_-]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\]\]/g, '')
        .replace(/\[\[/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.volume = 1;
    utterance.lang = 'fr-FR'; // Force language
    
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr'));
    if (frVoice) utterance.voice = frVoice;

    // Mobile hack: resume to unlock engine
    if (window.speechSynthesis.resume) window.speechSynthesis.resume();
    
    window.speechSynthesis.speak(utterance);
    
    // Visual debug toast to confirm playTTS was called
    const debugToast = document.createElement('div');
    debugToast.textContent = '🔊 Lecture TTS en cours...';
    debugToast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:20px;z-index:9999;font-size:12px;pointer-events:none;';
    document.body.appendChild(debugToast);
    
    utterance.onend = () => {
        if (debugToast.parentNode) debugToast.remove();
    };
    utterance.onerror = (e) => {
        debugToast.textContent = "🔊 TTS Error: " + (e.error || e.type);
        setTimeout(() => { if (debugToast.parentNode) debugToast.remove(); }, 3000);
        console.error("TTS Error", e);
    };
    
    // Failsafe removal
    setTimeout(() => { if (debugToast.parentNode) debugToast.remove(); }, 8000);
}

/**
 * Warmup TTS on user interaction (fixes mobile autoplay)
 */
let _ttsWarmedUp = false;
function warmupTTS() {
    if (!_ttsWarmedUp && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        // Hack: pause right after speaking so an utterance stays in the queue
        setTimeout(() => {
            if (window.speechSynthesis.pause) window.speechSynthesis.pause();
        }, 50);
        _ttsWarmedUp = true;
    }
}

/**
 * Show a toast notification when the agent finishes responding.
 * The toast is clickable and dismisses on tap.
 */
function showCompletionToast() {
    // Trigger native OS Notification if granted (clickable via SW)
    if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification("Antigravity", {
            body: "✅ Agent a terminé de répondre",
            icon: "/icons/icon-192.png",
            data: { url: window.location.href }
        });
        notif.onclick = () => {
            window.focus();
            notif.close();
        };
    }

    // Avoid duplicate toasts
    if (document.getElementById('completionToast')) return;
    const toast = document.createElement('div');
    toast.id = 'completionToast';
    toast.className = 'completion-toast';
    
    toast.textContent = '✅ Réponse reçue';
    
    toast.style.cursor = 'pointer';
    toast.style.pointerEvents = 'auto';
    toast.addEventListener('click', () => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    });
    document.body.appendChild(toast);
    // Trigger enter animation on next frame
    requestAnimationFrame(() => toast.classList.add('show'));
    // Auto-dismiss after 6 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }
    }, 6000);
}

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
            if (!data.isStreaming) {
                window.dispatchEvent(new Event('agent-stopped-streaming'));
            }
            // Notify ONLY when server transitions from streaming to complete
            if (!data.isStreaming && _wasStreaming) {
                showCompletionToast();
                if (_isTtsEnabled && data.messages) {
                    const finalMsgs = data.messages.filter(m => m.role !== 'user' && m.type !== 'taskBlock');
                    if (finalMsgs.length > 0) {
                        const last = finalMsgs[finalMsgs.length - 1];
                        if (last.content) {
                            playTTS(last.content);
                        } else {
                            playTTS("L'agent a terminé de générer une réponse.");
                        }
                    } else {
                        playTTS("L'agent a terminé de générer une réponse.");
                    }
                }
            }
            _wasStreaming = !!data.isStreaming;
            _wasConversationFinished = !!data.conversationFinished;
        }
    } catch (e) {
        // Display the error visually on the screen to debug the "infinite loading" bug
        const loadingP = document.querySelector('.loading-state p');
        if (loadingP) {
            loadingP.textContent = `Error: ${e.message}. Retrying...`;
        }
        // Server unreachable or JSON parse failed — silent fail, will retry next tick
        _lastPollJson = '';
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
        } else if (message.type === 'selector_error') {
            handleSelectorError(message.data);
        } else if (message.type === 'state') {
            updateStateUI(message.data);
        }
    });

    // 2. Initial chat state fetch
    pollChatState();

    // 3. Start 1-second polling loop (primary update mechanism)
    setInterval(pollChatState, 1000);

    // 4. Unified send handler — prevents double-send with workflow prefix
    let _sendGuard = false;
    function doSend() {
        warmupTTS();
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        if (_sendGuard) return;
        if (window.isAgentStreaming) {
            import('./chat.js?v=10').then(m => m.stopGeneration());
            return;
        }
        _sendGuard = true;
        const prefix = getWorkflowPrefix();
        const text = elements.chatInput.value.trim();
        clearWorkflow();
        
        let finalText = text;
        const draftedXml = flushDraftComments();
        
        if (draftedXml) {
            if (finalText) {
                finalText = draftedXml + "\n\n" + finalText;
            } else {
                finalText = draftedXml;
            }
        }
        
        if (prefix || finalText) {
            sendMessage(prefix + finalText);
        }
        
        // Release guard after a short delay to block any duplicate trigger
        setTimeout(() => { _sendGuard = false; }, 1000);
    }
    
    // Expose for artifacts module
    window._doSend = doSend;

    elements.sendBtn?.addEventListener('click', doSend);
    
    elements.chatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isPickerVisible()) {
                hidePicker();
                return;
            }
            doSend();
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
        
        // If a workflow is selected and user clears the input (deleted the slash),
        // remove the workflow badge
        if (getWorkflowPrefix() && this.value.trim() === '') {
            clearWorkflow();
        }
    });



    document.getElementById('newChatBtn')?.addEventListener('click', async () => {
        await startNewChat();
        setTimeout(pollChatState, 500);
    });

    // Reset the UI when a new chat is started
    window.addEventListener('new-chat-started', () => {
        // Clear all chat messages from the display
        if (elements.chatContent) {
            elements.chatContent.querySelectorAll('.chat-msg').forEach(el => el.remove());
        }
        // Reset polling cache so the next poll triggers a full re-render
        _lastPollJson = '';
        _wasConversationFinished = false;
        // Clear any pending user message
        window.pendingUserMessage = undefined;
    });

    
    document.getElementById('historyBtn')?.addEventListener('click', async () => {
        toggleLayer(elements.historyLayer, true);
        await loadHistory();
    });

    // Artifacts button
    document.getElementById('artifactsBtn')?.addEventListener('click', async () => {
        const layer = document.getElementById('artifactsLayer');
        toggleLayer(layer, true);
        await loadArtifacts();
    });
    
    // Refresh button (Hard reload)
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        window.location.reload(true);
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

    // TTS toggle
    function updateTtsUI() {
        if (!elements.ttsBtn) return;
        if (_isTtsEnabled) {
            elements.ttsIconOn.style.display = 'block';
            elements.ttsIconOff.style.display = 'none';
            elements.ttsText.textContent = 'TTS On';
            elements.ttsBtn.style.opacity = '1';
        } else {
            elements.ttsIconOn.style.display = 'none';
            elements.ttsIconOff.style.display = 'block';
            elements.ttsText.textContent = 'TTS Off';
            elements.ttsBtn.style.opacity = '0.7';
        }
    }
    
    updateTtsUI();
    
    elements.ttsBtn?.addEventListener('click', () => {
        warmupTTS();
        _isTtsEnabled = !_isTtsEnabled;
        localStorage.setItem('antigravity_tts', _isTtsEnabled);
        updateTtsUI();
        if (!_isTtsEnabled && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
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
        _lastPollJson = '';
        _wasConversationFinished = false;
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

    // Initialize artifacts
    initArtifacts();
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
