/**
 * Artifacts Module
 * Handles listing artifacts, viewing their markdown content, and adding comments via CDP.
 */

import { fetchWithAuth } from './api.js?v=10';

/** @type {string|null} Currently viewed artifact name */
let currentArtifact = null;

/**
 * Load the list of artifacts from the server and render them.
 */
export async function loadArtifacts() {
    const listEl = document.getElementById('artifactsList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading artifacts...</p></div>';

    try {
        const res = await fetchWithAuth('/api/artifacts');
        const data = await res.json();

        if (!data.artifacts || data.artifacts.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><p>No artifacts in this conversation</p></div>';
            return;
        }

        listEl.innerHTML = '';
        data.artifacts.forEach(art => {
            const item = document.createElement('button');
            item.className = 'artifact-item';
            item.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                </svg>
                <span class="artifact-item-name">${escapeHtml(art.name)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="artifact-item-chevron">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            `;
            item.onclick = () => openArtifactViewer(art.name);
            listEl.appendChild(item);
        });
    } catch (e) {
        listEl.innerHTML = `<div class="empty-state"><p>Error loading artifacts</p></div>`;
    }
}

/**
 * Open the artifact viewer with the content of a specific artifact.
 * @param {string} name Artifact name
 */
export async function openArtifactViewer(name) {
    const viewer = document.getElementById('artifactViewer');
    const titleEl = document.getElementById('artifactViewerTitle');
    const contentEl = document.getElementById('artifactViewerContent');
    if (!viewer || !contentEl) return;

    currentArtifact = name;
    titleEl.textContent = name;
    contentEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading...</p></div>';
    viewer.classList.add('open');

    try {
        const res = await fetchWithAuth(`/api/artifacts/${encodeURIComponent(name)}`);
        const data = await res.json();

        if (data.error) {
            contentEl.innerHTML = `<div class="empty-state"><p>${escapeHtml(data.error)}</p></div>`;
            return;
        }

        // Render the HTML from CDP (already rendered markdown from Antigravity)
        if (data.html) {
            contentEl.innerHTML = data.html;
        } else if (data.content) {
            // Fallback: render plain text with marked.js if available
            if (window.marked) {
                contentEl.innerHTML = marked.parse(data.content);
            } else {
                contentEl.textContent = data.content;
            }
        }

        // Update header info
        const proceedBtn = document.getElementById('artifactProceedBtn');
        if (proceedBtn) {
            proceedBtn.style.display = data.hasProceed ? 'flex' : 'none';
        }
    } catch (e) {
        contentEl.innerHTML = `<div class="empty-state"><p>Failed to load artifact</p></div>`;
    }
}

/**
 * Close the artifact viewer.
 */
export function closeArtifactViewer() {
    const viewer = document.getElementById('artifactViewer');
    if (viewer) viewer.classList.remove('open');
    currentArtifact = null;
}

/**
 * Submit a comment on the currently open artifact.
 */
export async function submitArtifactComment() {
    const textarea = document.getElementById('artifactCommentInput');
    if (!textarea || !currentArtifact) return;

    const comment = textarea.value.trim();
    if (!comment) return;

    const btn = document.getElementById('artifactCommentSubmit');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
        const res = await fetchWithAuth(`/api/artifacts/${encodeURIComponent(currentArtifact)}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment })
        });
        const data = await res.json();

        if (data.success) {
            textarea.value = '';
            // Show success feedback
            if (btn) {
                btn.textContent = '✓ Sent';
                setTimeout(() => { btn.textContent = 'Add Comment'; btn.disabled = false; }, 2000);
            }
        } else {
            if (btn) { btn.textContent = 'Error'; setTimeout(() => { btn.textContent = 'Add Comment'; btn.disabled = false; }, 2000); }
        }
    } catch (e) {
        if (btn) { btn.textContent = 'Error'; setTimeout(() => { btn.textContent = 'Add Comment'; btn.disabled = false; }, 2000); }
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Initialize the artifacts module event listeners.
 */
export function initArtifacts() {
    // Close viewer button
    document.getElementById('artifactViewerClose')?.addEventListener('click', closeArtifactViewer);

    // Comment submit
    document.getElementById('artifactCommentSubmit')?.addEventListener('click', submitArtifactComment);

    // Enter key in comment textarea
    document.getElementById('artifactCommentInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitArtifactComment();
        }
    });

    // Proceed button
    document.getElementById('artifactProceedBtn')?.addEventListener('click', async () => {
        if (!currentArtifact) return;
        try {
            // Click Proceed on the desktop via remote-click
            await fetchWithAuth('/remote-click', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selector: 'button', textContent: 'Proceed' })
            });
        } catch (e) {}
    });

    // Make functions globally available for inline handlers
    window.hideArtifacts = () => {
        const layer = document.getElementById('artifactsLayer');
        if (layer) layer.classList.remove('show');
    };
    window.closeArtifactViewer = closeArtifactViewer;

    // Global handler for inline artifact ref buttons in chat messages
    window._openArtifact = (encodedName) => {
        const name = decodeURIComponent(encodedName);
        openArtifactViewer(name);
    };
}
