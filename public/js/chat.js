/**
 * Chat and Messaging Logic
 */

import { fetchWithAuth } from './api.js';
import { elements } from './ui.js';

/**
 * Send a message to the workbench
 */
export async function sendMessage(text) {
    if (!text || !text.trim()) return;

    elements.sendBtn.disabled = true;
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';

    try {
        const res = await fetchWithAuth('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text.trim() })
        });
        const data = await res.json();
        if (data.error) {
            console.error('Send error:', data.error);
            alert(`Error: ${data.error}`);
        }
    } catch (e) {
        console.error('Failed to send message:', e);
    } finally {
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
export function scrollToBottom(frame) {
    const doc = frame.contentDocument || frame.contentWindow.document;
    const scrollContainer = doc.querySelector('.overflow-y-auto') || doc.documentElement;
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
}
