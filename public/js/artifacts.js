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

        // Re-apply any existing highlights for this artifact
        reapplyHighlights();

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
    closeReviewPopover();
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
    
    // Clear drafts and highlights
    draftComments = [];
    clearAllHighlights();
    updateBadge();
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
    let textarea, btn, isContextual = false;
    
    if (selectedText !== null && commentText !== null) {
        // Contextual comment from inline popover
        isContextual = true;
    } else {
        // Global comment from sidebar
        textarea = document.getElementById('artifactCommentInput');
        btn = document.getElementById('artifactCommentSubmit');
        if (!textarea) return false;
        commentText = textarea.value.trim();
    }

    if (!commentText || !currentArtifact) return false;

    const idx = _commentIdx++;

    // Push to drafts
    draftComments.push({
        artifact: currentArtifact,
        selectedText: isContextual ? selectedText : null,
        comment: commentText,
        idx
    });

    if (!isContextual && textarea) textarea.value = '';
    
    // Add visual highlight if contextual
    if (isContextual && selectedText) {
        highlightSelection(selectedText, commentText, idx);
    }

    // Update badge
    updateBadge();

    // Provide visual feedback for global comments
    if (btn && !isContextual) {
        const originalText = btn.textContent;
        btn.textContent = '✓ Saved in draft';
        btn.classList.add('success');
        setTimeout(() => { 
            btn.textContent = 'Add Comment'; 
            btn.classList.remove('success');
        }, 2000);
    }

    return true;
}

// ========== HIGHLIGHT SYSTEM ==========

/**
 * Highlight the currently selected text in the artifact viewer content.
 */
function highlightSelection(selectedText, commentText, idx) {
    const contentEl = document.getElementById('artifactViewerContent');
    if (!contentEl) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    
    // Check range is inside the viewer
    if (!contentEl.contains(range.commonAncestorContainer)) return;

    try {
        const mark = document.createElement('mark');
        mark.className = 'artifact-comment-highlight';
        mark.dataset.commentIdx = String(idx);
        mark.title = commentText.length > 60 ? commentText.substring(0, 57) + '...' : commentText;
        
        range.surroundContents(mark);

        // Attach click handler
        mark.addEventListener('click', (e) => {
            e.stopPropagation();
            showReviewPopover(mark, idx);
        });
    } catch (e) {
        // surroundContents fails if range crosses element boundaries
        // Fallback: just store the comment without visual highlight
        console.warn('[Artifacts] Could not highlight across element boundaries, comment saved without visual mark.');
    }

    sel.removeAllRanges();
}

/**
 * Re-apply highlights when re-opening the same artifact (if comments still exist).
 * Since the DOM is replaced on open, we attempt text-based matching.
 */
function reapplyHighlights() {
    const contentEl = document.getElementById('artifactViewerContent');
    if (!contentEl || !currentArtifact) return;

    const relevantDrafts = draftComments.filter(d => d.artifact === currentArtifact && d.selectedText);
    
    for (const draft of relevantDrafts) {
        // Try to find and highlight the text in the DOM
        const found = findAndWrapText(contentEl, draft.selectedText, draft.comment, draft.idx);
        if (!found) {
            console.warn(`[Artifacts] Could not re-highlight: "${draft.selectedText.substring(0, 30)}..."`);
        }
    }
}

/**
 * Walk the DOM text nodes and wrap the first occurrence of `searchText`.
 */
function findAndWrapText(root, searchText, commentText, idx) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    
    // Try finding in a single text node first
    while ((node = walker.nextNode())) {
        const pos = node.textContent.indexOf(searchText);
        if (pos === -1) continue;
        
        const range = document.createRange();
        range.setStart(node, pos);
        range.setEnd(node, pos + searchText.length);
        
        const mark = document.createElement('mark');
        mark.className = 'artifact-comment-highlight';
        mark.dataset.commentIdx = String(idx);
        mark.title = commentText.length > 60 ? commentText.substring(0, 57) + '...' : commentText;
        
        try {
            range.surroundContents(mark);
            mark.addEventListener('click', (e) => {
                e.stopPropagation();
                showReviewPopover(mark, idx);
            });
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

/**
 * Remove all highlights from the viewer content.
 */
function clearAllHighlights() {
    const contentEl = document.getElementById('artifactViewerContent');
    if (!contentEl) return;
    
    contentEl.querySelectorAll('.artifact-comment-highlight').forEach(mark => {
        const parent = mark.parentNode;
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
    });
}

/**
 * Update the comment count badge.
 */
function updateBadge() {
    const badge = document.getElementById('commentCountBadge');
    if (!badge) return;
    
    const count = draftComments.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

// ========== REVIEW POPOVER ==========

/**
 * Show a review popover on a highlighted comment.
 */
function showReviewPopover(markEl, idx) {
    closeReviewPopover();

    const draft = draftComments.find(d => d.idx === idx);
    if (!draft) return;

    const popover = document.createElement('div');
    popover.id = 'commentReviewPopover';
    popover.className = 'comment-review-popover';

    const quoteText = draft.selectedText
        ? (draft.selectedText.length > 80 ? draft.selectedText.substring(0, 77) + '...' : draft.selectedText)
        : '';

    popover.innerHTML = `
        ${quoteText ? `<div class="crp-quote">"${escapeHtml(quoteText)}"</div>` : ''}
        <div class="crp-comment">${escapeHtml(draft.comment)}</div>
        <div class="crp-actions">
            <button class="crp-btn edit">Edit</button>
            <button class="crp-btn delete">Delete</button>
        </div>
    `;

    // Position near the mark
    const rect = markEl.getBoundingClientRect();
    document.body.appendChild(popover);
    
    popover.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    popover.style.left = Math.max(10, Math.min(
        rect.left + window.scrollX,
        window.innerWidth - 300
    )) + 'px';

    // Edit button
    popover.querySelector('.crp-btn.edit').onclick = (e) => {
        e.stopPropagation();
        showEditMode(popover, draft, markEl);
    };

    // Delete button
    popover.querySelector('.crp-btn.delete').onclick = (e) => {
        e.stopPropagation();
        deleteComment(idx, markEl);
        closeReviewPopover();
    };

    // Close on outside click (delayed to avoid immediate close)
    setTimeout(() => {
        const closeHandler = (ev) => {
            if (!popover.contains(ev.target) && ev.target !== markEl) {
                closeReviewPopover();
                document.removeEventListener('mousedown', closeHandler);
                document.removeEventListener('touchstart', closeHandler);
            }
        };
        document.addEventListener('mousedown', closeHandler);
        document.addEventListener('touchstart', closeHandler, { passive: true });
    }, 50);
}

/**
 * Switch the review popover to edit mode.
 */
function showEditMode(popover, draft, markEl) {
    const quoteText = draft.selectedText
        ? (draft.selectedText.length > 80 ? draft.selectedText.substring(0, 77) + '...' : draft.selectedText)
        : '';

    popover.innerHTML = `
        ${quoteText ? `<div class="crp-quote">"${escapeHtml(quoteText)}"</div>` : ''}
        <textarea class="crp-edit-input">${escapeHtml(draft.comment)}</textarea>
        <div class="crp-actions">
            <button class="crp-btn cancel-edit">Cancel</button>
            <button class="crp-btn save">Save</button>
        </div>
    `;

    const input = popover.querySelector('.crp-edit-input');
    input.focus();

    popover.querySelector('.crp-btn.cancel-edit').onclick = (e) => {
        e.stopPropagation();
        closeReviewPopover();
    };

    popover.querySelector('.crp-btn.save').onclick = (e) => {
        e.stopPropagation();
        const newText = input.value.trim();
        if (newText) {
            draft.comment = newText;
            markEl.title = newText.length > 60 ? newText.substring(0, 57) + '...' : newText;
        }
        closeReviewPopover();
    };
}

/**
 * Delete a draft comment and remove its highlight.
 */
function deleteComment(idx, markEl) {
    draftComments = draftComments.filter(d => d.idx !== idx);
    
    // Unwrap the mark element
    if (markEl && markEl.parentNode) {
        const parent = markEl.parentNode;
        while (markEl.firstChild) {
            parent.insertBefore(markEl.firstChild, markEl);
        }
        parent.removeChild(markEl);
        parent.normalize();
    }
    
    updateBadge();
}

/**
 * Close any open review popover.
 */
function closeReviewPopover() {
    const existing = document.getElementById('commentReviewPopover');
    if (existing) existing.remove();
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

    // Handle clicking the comment button
    popover.querySelector('.inline-comment-trigger').onclick = (e) => {
        e.stopPropagation();
        
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
        input.focus();

        popover.querySelector('.cancel').onclick = (e) => {
            e.stopPropagation();
            popover.style.display = 'none';
            popover.classList.remove('expanded');
            window.getSelection().removeAllRanges();
        };

        const submitBtn = popover.querySelector('.submit');
        submitBtn.onclick = async (e) => {
            e.stopPropagation();
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
            submitArtifactComment(null, null); // Global comment
        }
    });

    // Handle contextual comment selection
    const viewerContent = document.getElementById('artifactViewerContent');
    if (viewerContent) {
        viewerContent.addEventListener('mouseup', handleTextSelection);
        viewerContent.addEventListener('keyup', (e) => {
            if (e.key === 'Shift' || e.key.includes('Arrow')) handleTextSelection();
        });
        
        // Support for mobile text selection
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const node = sel.anchorNode;
                if (viewerContent.contains(node)) {
                    clearTimeout(window._selTimeout);
                    window._selTimeout = setTimeout(handleTextSelection, 400);
                }
            }
        });
    }

    // Hide inline popover when clicking outside
    const hidePopover = (e) => {
        const popover = document.getElementById('artifact-inline-popover');
        if (popover && !popover.contains(e.target)) {
            popover.style.display = 'none';
            popover.classList.remove('expanded');
        }
    };
    document.addEventListener('mousedown', hidePopover);
    document.addEventListener('touchstart', hidePopover, { passive: true });

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
