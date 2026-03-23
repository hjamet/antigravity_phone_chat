/**
 * Artifacts Module
 * Handles listing artifacts, viewing their markdown content, and adding comments via CDP.
 * Comments are shown as persistent yellow highlights in the viewer content.
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

        // Render the draft comments section
        renderDraftList();
        updateSendButton();

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
 * Pending comments waiting to be sent
 * @type {Array<{artifact: string, selectedText: string|null, comment: string, idx: number}>}
 */
let draftComments = [];
let _commentIdx = 0;

/**
 * Returns all drafted comments formatted as XML and clears the draft list.
 * @returns {string} XML formatted comments, or empty string if none
 */
export function flushDraftComments() {
    if (draftComments.length === 0) return '';
    
    let xml = '';
    draftComments.forEach(draft => {
        // Need to ensure we don't break XML structure
        const safeTarget = draft.artifact.replace(/"/g, '&quot;');
        xml += `<artifact_comment target="${safeTarget}">\n`;
        if (draft.selectedText) {
            xml += `<selected_text>\n${draft.selectedText}\n</selected_text>\n`;
        }
        xml += `<comment>\n${draft.comment}\n</comment>\n`;
        xml += `</artifact_comment>\n\n`;
    });
    
    // Clear drafts and update UI
    draftComments = [];
    updateSendButton();
    renderDraftList();
    return xml.trim();
}

/**
 * Get draft comment count for external use.
 */
export function getDraftCommentCount() {
    return draftComments.length;
}

/**
 * Submit a comment on the currently open artifact.
 * Instead of sending immediately, it drafts the comment to be sent with the next chat message.
 * @param {string|null} selectedText Optional text selection for contextual comments
 * @param {string} commentText The comment content
 * @returns {Promise<boolean>} Success status
 */
export async function submitArtifactComment(selectedText = null, commentText = null) {
    if (!commentText || !currentArtifact) return false;

    const idx = _commentIdx++;

    // Push to drafts
    draftComments.push({
        artifact: currentArtifact,
        selectedText: selectedText,
        comment: commentText,
        idx
    });

    // Update UI
    updateSendButton();
    renderDraftList();

    return true;
}

// ========== DRAFT COMMENTS UI ==========

/**
 * Render the list of draft comments at the bottom of the viewer.
 */
function renderDraftList() {
    const contentEl = document.getElementById('artifactViewerContent');
    if (!contentEl || !currentArtifact) return;

    // Remove existing section if any
    const existing = document.getElementById('draftCommentsSection');
    if (existing) existing.remove();

    const drafts = draftComments.filter(d => d.artifact === currentArtifact);

    const section = document.createElement('div');
    section.id = 'draftCommentsSection';
    section.className = 'draft-comments-section';

    if (drafts.length > 0) {
        const title = document.createElement('h3');
        title.innerHTML = '📝 Draft Comments';
        section.appendChild(title);

        drafts.forEach(draft => {
            const card = document.createElement('div');
            card.className = 'draft-comment-card';
            
            // If we are in edit mode
            if (draft._isEditing) {
                const quoteHtml = draft.selectedText
                    ? `<div class="draft-comment-quote">"${escapeHtml(draft.selectedText.length > 80 ? draft.selectedText.substring(0, 77) + '...' : draft.selectedText)}"</div>`
                    : '';
                
                card.innerHTML = `
                    ${quoteHtml}
                    <textarea class="crp-edit-input">${escapeHtml(draft.comment)}</textarea>
                    <div class="draft-comment-actions">
                        <button class="draft-action-btn cancel-edit">Cancel</button>
                        <button class="draft-action-btn save-edit" style="color: #8b5cf6;">Save</button>
                    </div>
                `;

                const input = card.querySelector('.crp-edit-input');
                // Auto focus
                setTimeout(() => input.focus(), 50);

                card.querySelector('.cancel-edit').onclick = () => {
                    draft._isEditing = false;
                    renderDraftList();
                };

                card.querySelector('.save-edit').onclick = () => {
                    const newText = input.value.trim();
                    if (newText) {
                        draft.comment = newText;
                    }
                    draft._isEditing = false;
                    renderDraftList();
                };
            } else {
                // Normal view mode
                const quoteHtml = draft.selectedText
                    ? `<div class="draft-comment-quote">"${escapeHtml(draft.selectedText.length > 100 ? draft.selectedText.substring(0, 97) + '...' : draft.selectedText)}"</div>`
                    : '';
                
                card.innerHTML = `
                    ${quoteHtml}
                    <div class="draft-comment-body">${escapeHtml(draft.comment).replace(/\n/g, '<br>')}</div>
                    <div class="draft-comment-actions">
                        <button class="draft-action-btn edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            Edit
                        </button>
                        <button class="draft-action-btn delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Delete
                        </button>
                    </div>
                `;

                card.querySelector('.edit').onclick = () => {
                    draft._isEditing = true;
                    renderDraftList();
                };

                card.querySelector('.delete').onclick = () => {
                    deleteComment(draft.idx);
                };
            }

            section.appendChild(card);
        });
    }

    // Add general comment button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-general-comment-btn';
    addBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add General Comment
    `;
    addBtn.onclick = () => {
        // Create an empty draft in edit mode
        const idx = _commentIdx++;
        draftComments.push({
            artifact: currentArtifact,
            selectedText: null,
            comment: '',
            idx,
            _isEditing: true
        });
        updateSendButton();
        renderDraftList();
        
        // Scroll to bottom
        setTimeout(() => {
            contentEl.scrollTop = contentEl.scrollHeight;
        }, 50);
    };
    section.appendChild(addBtn);

    contentEl.appendChild(section);
}

/**
 * Delete a draft comment
 */
function deleteComment(idx) {
    draftComments = draftComments.filter(d => d.idx !== idx);
    updateSendButton();
    renderDraftList();
}

/**
 * Update the visibility of the Send Comments button
 */
function updateSendButton() {
    const btn = document.getElementById('sendCommentsBtn');
    if (!btn) return;
    
    const count = draftComments.length;
    btn.style.display = count > 0 ? 'flex' : 'none';
    if (count > 0) {
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Send ${count} Comment${count > 1 ? 's' : ''}
        `;
    }
}

/**
 * Send all drafted comments using the main chat input flow
 */
export function sendAllComments() {
    if (draftComments.length === 0) return;
    if (window._doSend) {
        window._doSend();
        closeArtifactViewer();
    }
}

// ========== TEXT SELECTION HANDLER ==========

/**
 * Handle text selection in the artifact viewer to show inline comment button
 */
function handleTextSelection() {
    // Remove existing popovers
    const existingPopover = document.getElementById('artifact-inline-popover');
    
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (!text || text.length === 0) {
        // If clicking outside, close popover unless clicking inside it
        return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Create floating "+ Comment" button
    let popover = existingPopover;
    if (!popover) {
        popover = document.createElement('div');
        popover.id = 'artifact-inline-popover';
        popover.className = 'artifact-inline-popover';
        document.body.appendChild(popover);
    }
    
    // Position slightly above the selection
    popover.style.top = (rect.top + window.scrollY - 40) + 'px';
    popover.style.left = (rect.left + window.scrollX + (rect.width / 2)) + 'px';
    popover.style.display = 'flex';
    
    // Initial state: Just the comment button
    popover.innerHTML = `
        <button class="inline-comment-trigger" title="Comment on this selection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Comment
        </button>
    `;

    // Handle clicking the comment button — use both click and touchend for mobile
    const triggerBtn = popover.querySelector('.inline-comment-trigger');
    const expandPopover = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Expand into a small textarea
        popover.classList.add('expanded');
        popover.innerHTML = `
            <div class="inline-comment-form">
                <div class="inline-comment-quote">"${text.length > 50 ? text.substring(0, 47) + '...' : text}"</div>
                <textarea class="inline-comment-input" placeholder="Type your comment..." autofocus></textarea>
                <div class="inline-comment-actions">
                    <button class="inline-btn cancel">Cancel</button>
                    <button class="inline-btn submit">Save</button>
                </div>
            </div>
        `;
        
        const input = popover.querySelector('.inline-comment-input');
        // Delay focus slightly on mobile to prevent keyboard issues
        setTimeout(() => input.focus(), 100);

        popover.querySelector('.cancel').onclick = (ev) => {
            ev.stopPropagation();
            popover.style.display = 'none';
            popover.classList.remove('expanded');
            window.getSelection().removeAllRanges();
        };

        const submitBtn = popover.querySelector('.submit');
        submitBtn.onclick = async (ev) => {
            ev.stopPropagation();
            const commentVal = input.value.trim();
            if (!commentVal) return;
            
            submitBtn.textContent = '...';
            submitBtn.disabled = true;
            
            const success = await submitArtifactComment(text, commentVal);
            if (success) {
                popover.style.display = 'none';
                popover.classList.remove('expanded');
            } else {
                submitBtn.textContent = 'Error';
                setTimeout(() => { submitBtn.textContent = 'Save'; submitBtn.disabled = false; }, 2000);
            }
        };
    };
    triggerBtn.onclick = expandPopover;
    triggerBtn.addEventListener('touchend', expandPopover, { passive: false });
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

    // Send Comments button
    document.getElementById('sendCommentsBtn')?.addEventListener('click', sendAllComments);

    // Handle contextual comment selection
    const viewerContent = document.getElementById('artifactViewerContent');
    if (viewerContent) {
        viewerContent.addEventListener('mouseup', handleTextSelection);
        viewerContent.addEventListener('keyup', (e) => {
            if (e.key === 'Shift' || e.key.includes('Arrow')) handleTextSelection();
        });
        
        // Mobile: direct touchend on viewer to capture selection after finger lifts
        viewerContent.addEventListener('touchend', () => {
            clearTimeout(window._selTimeout);
            window._selTimeout = setTimeout(handleTextSelection, 350);
        }, { passive: true });

        // Support for mobile text selection via selectionchange
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && sel.toString().trim().length > 0) {
                const node = sel.anchorNode;
                if (viewerContent.contains(node)) {
                    clearTimeout(window._selTimeout);
                    window._selTimeout = setTimeout(handleTextSelection, 600);
                }
            }
        });
    }

    // Hide inline popover when clicking outside
    // Excludes clicks on highlights (they have their own handler)
    const hidePopover = (e) => {
        const popover = document.getElementById('artifact-inline-popover');
        if (!popover) return;
        if (popover.contains(e.target)) return;
        // Don't hide if clicking on a comment highlight — it has its own click handler
        if (e.target.closest && e.target.closest('.artifact-comment-highlight')) return;
        popover.style.display = 'none';
        popover.classList.remove('expanded');
    };
    document.addEventListener('mousedown', hidePopover);
    // Use touchend instead of touchstart on mobile — touchstart fires BEFORE onclick
    // which would kill the popover before the comment trigger can be clicked
    document.addEventListener('touchend', (e) => {
        // Small delay to let click/touchend handlers on the popover fire first
        setTimeout(() => hidePopover(e), 150);
    }, { passive: true });

    // Proceed button
    document.getElementById('artifactProceedBtn')?.addEventListener('click', async () => {
        if (!currentArtifact) return;
        try {
            await fetchWithAuth('/api/artifacts/proceed', { method: 'POST' });
            // Hide the button after clicking
            const btn = document.getElementById('artifactProceedBtn');
            if (btn) btn.style.display = 'none';
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
