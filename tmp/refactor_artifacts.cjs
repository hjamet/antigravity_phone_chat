const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'js', 'artifacts.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. In openArtifactViewer, replace reapplyHighlights and update ProceedBtn with new logic
code = code.replace(
    /\/\/ Re-apply any existing highlights for this artifact\s+reapplyHighlights\(\);\s+\/\/ Update header info\s+const proceedBtn = document\.getElementById\('artifactProceedBtn'\);\s+if \(proceedBtn\) \{\s+proceedBtn\.style\.display = data\.hasProceed \? 'flex' : 'none';\s+\}/,
    `// Render the draft comments section\n        renderDraftList();\n        updateSendButton();\n\n        // Update header info\n        const proceedBtn = document.getElementById('artifactProceedBtn');\n        if (proceedBtn) {\n            proceedBtn.style.display = data.hasProceed ? 'flex' : 'none';\n        }`
);

// 2. In closeArtifactViewer, remove closeReviewPopover
code = code.replace(
    /currentArtifact = null;\s+closeReviewPopover\(\);/,
    `currentArtifact = null;`
);

// 3. In flushDraftComments, replace clearAllHighlights and updateBadge
code = code.replace(
    /\/\/ Clear drafts and highlights\s+draftComments = \[\];\s+clearAllHighlights\(\);\s+updateBadge\(\);/,
    `// Clear drafts and update UI\n    draftComments = [];\n    updateSendButton();\n    renderDraftList();`
);

// 4. Update submitArtifactComment
const newSubmit = `export async function submitArtifactComment(selectedText = null, commentText = null) {
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
}`;
code = code.replace(
    /export async function submitArtifactComment.*?return true;\n}/s,
    newSubmit
);

// 5. Replace lines 211 to 499 (the highlight and popover system) with our new UI logic
const newUI = `// ========== DRAFT COMMENTS UI ==========

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
                    ? \`<div class="draft-comment-quote">"\${escapeHtml(draft.selectedText.length > 80 ? draft.selectedText.substring(0, 77) + '...' : draft.selectedText)}"</div>\`
                    : '';
                
                card.innerHTML = \`
                    \${quoteHtml}
                    <textarea class="crp-edit-input">\${escapeHtml(draft.comment)}</textarea>
                    <div class="draft-comment-actions">
                        <button class="draft-action-btn cancel-edit">Cancel</button>
                        <button class="draft-action-btn save-edit" style="color: #8b5cf6;">Save</button>
                    </div>
                \`;

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
                    ? \`<div class="draft-comment-quote">"\${escapeHtml(draft.selectedText.length > 100 ? draft.selectedText.substring(0, 97) + '...' : draft.selectedText)}"</div>\`
                    : '';
                
                card.innerHTML = \`
                    \${quoteHtml}
                    <div class="draft-comment-body">\${escapeHtml(draft.comment).replace(/\\n/g, '<br>')}</div>
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
                \`;

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
    addBtn.innerHTML = \`
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add General Comment
    \`;
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
        btn.innerHTML = \`
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Send \${count} Comment\${count > 1 ? 's' : ''}
        \`;
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
}`;

code = code.replace(/\/\/ ========== HIGHLIGHT SYSTEM ==========.*?\/\/ ========== TEXT SELECTION HANDLER ==========/s, newUI + '\n\n// ========== TEXT SELECTION HANDLER ==========');

// 6. Update initArtifacts
code = code.replace(
    /\/\/ Comment submit.*?\}\);/s,
    `// Send Comments button\n    document.getElementById('sendCommentsBtn')?.addEventListener('click', sendAllComments);`
);

fs.writeFileSync(filePath, code);
console.log('Modified artifacts.js successfully');
