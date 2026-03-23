/**
 * Main Application Entry Point
 * Phase 5: Polls /api/chat-state every second as primary update mechanism
 */

import { initWS } from './ws.js?v=11';
import { elements, renderChatState, renderSnapshot, updateStateUI, toggleLayer, getMessageHash } from './ui.js?v=16';
import { sendMessage, stopGeneration, scrollToBottom } from './chat.js?v=10';
import { loadHistory, startNewChat } from './history.js?v=14';
import { loadProjects } from './projects.js?v=10';
import { fetchWithAuth } from './api.js?v=10';
import { initPicker, onTriggerChar, hidePicker, isPickerVisible, getWorkflowPrefix, clearWorkflow } from './picker.js?v=13';
import { loadArtifacts, initArtifacts, flushDraftComments } from './artifacts.js?v=5';
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

let _ttsQueue = [];
let _ttsIsPlaying = false;
let _ttsDebugToast = null;
let _activeTtsHash = null;

let _audioCtx = null;
let _currentSource = null;

function getAudioContext() {
    if (!_audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        _audioCtx = new AudioContext();
    }
    return _audioCtx;
}

function stopTTS() {
    if (_currentSource) {
        try {
            _currentSource.onended = null;
            _currentSource.stop();
        } catch(e) {}
        _currentSource = null;
    }

    const audioEl = document.getElementById('ttsAudio');
    if (audioEl) {
        audioEl.pause();
        audioEl.currentTime = 0;
    }
    _ttsQueue = [];
    _ttsIsPlaying = false;
    _activeTtsHash = null;
    
    if (_ttsDebugToast && _ttsDebugToast.parentNode) _ttsDebugToast.remove();
    _ttsDebugToast = null;
    
    // Reset all buttons status visually
    document.querySelectorAll('.inline-tts-btn').forEach(btn => {
        btn.classList.remove('playing');
        const playIcon = btn.querySelector('.icon-play');
        const stopIcon = btn.querySelector('.icon-stop');
        const label = btn.querySelector('.tts-label');
        if (playIcon) playIcon.style.display = 'block';
        if (stopIcon) stopIcon.style.display = 'none';
        if (label) label.textContent = 'Écouter';
    });
}

window.toggleMsgTTS = function(btn) {
    const hash = btn.getAttribute('data-tts-hash');
    const encodedText = btn.getAttribute('data-tts-content');
    
    if (!encodedText) return;
    const text = decodeURIComponent(encodedText);
    
    if (_ttsIsPlaying && _activeTtsHash === hash) {
        // Stop current
        stopTTS();
    } else {
        // Stop previous if any, then play new
        stopTTS();
        _activeTtsHash = hash;
        playTTS(text, hash);
    }
};

/**
 * ===== Unread Conversation Tracking =====
 * Background polls /chat-history every 15s.
 * Compares isFinished states to detect NEW completions.
 * Shows a badge on the history button + a clickable toast.
 */
let _knownFinished = new Set();  // titles of chats we already knew were finished
let _unreadInitialized = false;  // first poll is just a baseline, don't alert

function updateHistoryBadge(count) {
    const btn = document.getElementById('historyBtn');
    if (!btn) return;
    let badge = btn.querySelector('.unread-badge');
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'unread-badge';
            btn.style.position = 'relative';
            btn.appendChild(badge);
        }
        badge.textContent = count;
        badge.style.display = 'flex';
    } else if (badge) {
        badge.style.display = 'none';
    }
}

function showUnreadToast(title) {
    // Remove any existing unread toast
    document.querySelectorAll('.unread-toast').forEach(el => el.remove());
    const toast = document.createElement('div');
    toast.className = 'unread-toast';
    toast.innerHTML = `<span>🟠 <strong>${title.substring(0, 50)}</strong> terminée</span>`;
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
        toast.remove();
        window.selectChat?.(title);
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }
    }, 8000);
}

async function pollUnreadConversations() {
    try {
        const res = await fetchWithAuth('/chat-history');
        const data = await res.json();
        if (!data.success || !data.chats) return;

        const currentFinished = new Set();
        data.chats.forEach(c => {
            if (c.isFinished) currentFinished.add(c.title);
        });

        if (!_unreadInitialized) {
            // First run: seed the baseline
            _knownFinished = currentFinished;
            _unreadInitialized = true;
            updateHistoryBadge(currentFinished.size);
            return;
        }

        // Detect newly finished chats
        for (const title of currentFinished) {
            if (!_knownFinished.has(title)) {
                // This chat just finished!
                showUnreadToast(title);
            }
        }

        _knownFinished = currentFinished;
        updateHistoryBadge(currentFinished.size);
    } catch(e) { /* silent */ }
}

/** Mark a chat as read locally to update badge instantly before next poll */
function markChatRead(title) {
    if (_knownFinished.has(title)) {
        _knownFinished.delete(title);
        updateHistoryBadge(_knownFinished.size);
    }
}

// Expose for history.js
window._markChatRead = markChatRead;

/**
 * Read text using Server-Side TTS API
 */
async function playTTS(text, hash = null) {
    _lastFinalMessageText = text;
    
    stopTTS(); // Ensures queue is empty and current playback stopped
    
    _ttsIsPlaying = false;
    _activeTtsHash = hash;

    if (_ttsDebugToast && _ttsDebugToast.parentNode) _ttsDebugToast.remove();
    _ttsDebugToast = document.createElement('div');
    _ttsDebugToast.textContent = '🔊 Lecture TTS en cours...';
    _ttsDebugToast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:20px;z-index:9999;font-size:12px;pointer-events:none;';
    document.body.appendChild(_ttsDebugToast);
    
    // Update button UI if hash provided
    if (hash) {
        const btn = document.getElementById(`tts-btn-${hash}`);
        if (btn) {
            btn.classList.add('playing');
            const playIcon = btn.querySelector('.icon-play');
            const stopIcon = btn.querySelector('.icon-stop');
            const label = btn.querySelector('.tts-label');
            if (playIcon) playIcon.style.display = 'none';
            if (stopIcon) stopIcon.style.display = 'block';
            if (label) label.textContent = 'Stop';
        }
    }

    try {
        const res = await fetchWithAuth('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        
        if (data.urls && data.urls.length > 0) {
            _ttsQueue = data.urls;
            playNextTTSChunk();
        } else {
            stopTTS();
        }
    } catch (e) {
        console.error('TTS Fetch Error', e);
        if (_ttsDebugToast) {
            _ttsDebugToast.textContent = "🔊 TTS Error: " + e.message;
            setTimeout(() => { if (_ttsDebugToast && _ttsDebugToast.parentNode) _ttsDebugToast.remove(); }, 3000);
        }
        stopTTS();
    }
}

async function playNextTTSChunk() {
    if (_ttsQueue.length === 0) {
        stopTTS();
        return;
    }
    
    _ttsIsPlaying = true;
    const url = _ttsQueue.shift();
    
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            await ctx.resume().catch(()=>{});
        }
        
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        ctx.decodeAudioData(arrayBuffer, (audioBuffer) => {
            _currentSource = ctx.createBufferSource();
            _currentSource.buffer = audioBuffer;
            _currentSource.playbackRate.value = 1.35;
            _currentSource.connect(ctx.destination);
            
            _currentSource.onended = () => {
                _currentSource = null;
                playNextTTSChunk();
            };
            
            _currentSource.start(0);
        }, (err) => {
            console.error('Audio decode error', err);
            playNextTTSChunk(); // Skip chunk
        });
        
    } catch (e) {
        console.error('Web Audio API error:', e);
        stopTTS();
    }
}

/**
 * Warmup TTS on user interaction (fixes mobile autoplay)
 */
let _ttsWarmedUp = false;
function warmupTTS() {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(()=>{});
        }
    } catch(e) {}

    if (!_ttsWarmedUp) {
        const audioEl = document.getElementById('ttsAudio');
        if (audioEl) {
            audioEl.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
            audioEl.play().catch(()=>{});
            _ttsWarmedUp = true;
        }
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
                // Ensure there are actually messages before notifying (fixes new chat bug)
                if (data.messages && data.messages.length > 0) {
                    showCompletionToast();
                    if (_isTtsEnabled) {
                        const finalMsgs = data.messages.filter(m => m.role !== 'user' && m.type !== 'taskBlock');
                        if (finalMsgs.length > 0) {
                            const last = finalMsgs[finalMsgs.length - 1];
                            const hash = last.type ? getMessageHash(last) : null;
                            if (last.content) {
                                playTTS(last.content, hash);
                            } else {
                                playTTS("L'agent a terminé de générer une réponse.");
                            }
                        } else {
                            const hasAgent = data.messages.some(m => m.role !== 'user');
                            if (hasAgent) {
                                playTTS("L'agent a terminé de générer une réponse.");
                            }
                        }
                    }
                    
                    // The current chat just finished streaming in front of the user, mark it as read
                    fetchWithAuth('/app-state').then(r=>r.json()).then(state => {
                        if (state && state.chatTitle) {
                            try {
                                let readChats = JSON.parse(localStorage.getItem('antigravity_read_chats')) || [];
                                if (!readChats.includes(state.chatTitle)) {
                                    readChats.push(state.chatTitle);
                                    localStorage.setItem('antigravity_read_chats', JSON.stringify(readChats));
                                }
                            } catch(e) {}
                        }
                    }).catch(()=>{});
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
        
        // Release guard after a short delay (4 seconds instead of 2) to block duplicate trigger more forcefully
        setTimeout(() => { _sendGuard = false; }, 4000);
    }
    
    // Expose for artifacts module
    window._doSend = doSend;

    // Use composedPath / preventDefault to ensure we only get the button click once
    elements.sendBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        doSend();
    });
    
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
        _wasStreaming = false; // Fix TTS bug
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

    // Screenshot button
    document.getElementById('screenshotBtn')?.addEventListener('click', async () => {
        const viewer = document.getElementById('screenshotViewer');
        const body = document.getElementById('screenshotViewerBody');
        if (!viewer || !body) return;

        // Show overlay with loading state
        body.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Capturing screenshot...</p></div>';
        viewer.classList.add('show');

        try {
            const res = await fetchWithAuth('/api/screenshot');
            const data = await res.json();
            if (data.data) {
                body.innerHTML = `<img src="${data.data}" alt="Agent Manager Screenshot" />`;
            } else {
                body.innerHTML = '<div class="loading-state"><p>❌ ' + (data.error || 'Screenshot failed') + '</p></div>';
            }
        } catch (e) {
            body.innerHTML = '<div class="loading-state"><p>❌ ' + e.message + '</p></div>';
        }
    });

    document.getElementById('screenshotViewerClose')?.addEventListener('click', () => {
        document.getElementById('screenshotViewer')?.classList.remove('show');
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
        if (!_isTtsEnabled) {
            stopTTS();
        }
    });

    // Global Close handlers
    window.hideChatHistory = () => toggleLayer(elements.historyLayer, false);
    window.hideProjects = () => toggleLayer(elements.projectsLayer, false);
    window.closeModal = () => toggleLayer(document.getElementById('modalOverlay'), false);
    window.startNewChat = startNewChat;
    window.selectChat = async (title) => {
        window.hideChatHistory();
        markChatRead(title);
        const { selectChat } = await import('./history.js');
        await selectChat(title);
        _lastPollJson = '';
        _wasConversationFinished = false;
        _wasStreaming = false; // Fix TTS bug
        setTimeout(pollChatState, 1500);
    };

    if (elements.sslBanner) elements.sslBanner.style.display = 'none';

    window.openNewWorkspace = async () => {
        window.hideProjects();
        try {
            await fetchWithAuth('/api/workspace/open', { method: 'POST' });
        } catch (e) {}
    };

    // State sync (mode, model, workspace)
    syncState();
    setInterval(syncState, 5000);

    // Initialize picker
    initPicker();

    // Initialize artifacts
    initArtifacts();

    // Start unread conversation background poll (every 15s)
    pollUnreadConversations();
    setInterval(pollUnreadConversations, 15000);
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
