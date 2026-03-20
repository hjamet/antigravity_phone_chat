/**
 * Chat and Messaging Logic
 */

import { fetchWithAuth } from './api.js';
import { elements } from './ui.js';

let isSending = false;
let pendingMessages = [];

window.addEventListener('agent-stopped-streaming', () => {
    if (pendingMessages.length > 0 && !isSending && !window.isAgentStreaming) {
        const nextMsg = pendingMessages.shift();
        sendMessage(nextMsg);
    }
});

/**
 * Send a message to the workbench
 */
export async function sendMessage(text) {
    if (!text || !text.trim() || isSending) return;

    if (window.isAgentStreaming) {
        pendingMessages.push(text);
        elements.chatInput.value = '';
        elements.chatInput.style.height = 'auto';
        
        // Affichage temporaire en file d'attente piloté par ui.js
        localStorage.setItem('pendingUserMessage', text);
        return;
    }

    isSending = true;
    const trimmed = text.trim();
    elements.sendBtn.disabled = true;
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    
    // Store user message locally for immediate display
    localStorage.setItem('pendingUserMessage', trimmed);
    window.dispatchEvent(new CustomEvent('user-message-sent', { detail: trimmed }));

    try {
        const res = await fetchWithAuth('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: trimmed })
        });
        const data = await res.json();
        if (data.error) {
            console.error('Send error:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (e) {
        console.error('Failed to send message:', e);
    } finally {
        isSending = false;
        elements.sendBtn.disabled = false;
    }
}

/**
 * Stop AI generation
 */
export async function stopGeneration() {
    try {
        await fetchWithAuth('/stop', { method: 'POST' });
    } catch (e) {
        console.error('Stop error:', e);
    }
}

/**
 * Auto-scroll the snapshot frame to the bottom
 */
export function scrollToBottom(container) {
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}
