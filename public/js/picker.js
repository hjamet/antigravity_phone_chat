/**
 * Picker Module — Handles "/" workflow trigger detection.
 * Shows a popup with available workflows and displays selected
 * workflow as a badge above the input bar.
 */

import { fetchWithAuth } from './api.js';

let pickerVisible = false;
let pickerEl = null;
let badgeEl = null;
let selectedWorkflow = null; // { name, label }

/**
 * Initialize the picker: create DOM elements.
 */
export function initPicker() {
    // Picker popup
    pickerEl = document.createElement('div');
    pickerEl.id = 'pickerPopup';
    pickerEl.className = 'picker-popup';
    pickerEl.innerHTML = '<div class="picker-header">⚡ Workflows</div><div class="picker-items"></div>';

    // Badge container (above input)
    badgeEl = document.createElement('div');
    badgeEl.id = 'workflowBadge';
    badgeEl.className = 'workflow-badge-container';

    const inputSection = document.querySelector('.input-section');
    if (inputSection) {
        inputSection.prepend(pickerEl);
        inputSection.prepend(badgeEl);
    }
}

/**
 * Trigger "/" workflow picker
 */
export async function onTriggerChar() {
    if (pickerVisible) { hidePicker(); return; }

    showPickerLoading();

    try {
        const res = await fetchWithAuth('/api/picker/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ char: '/' })
        });
        const data = await res.json();

        if (data.ok && data.items?.length > 0) {
            renderItems(data.items);
        } else {
            hidePicker();
        }
    } catch (e) {
        console.error('Picker trigger failed:', e);
        hidePicker();
    }
}

/**
 * Show loading state
 */
function showPickerLoading() {
    if (!pickerEl) return;
    pickerEl.classList.add('show');
    pickerVisible = true;
    const items = pickerEl.querySelector('.picker-items');
    if (items) items.innerHTML = '<div class="picker-item loading">⏳</div>';
}

/**
 * Render workflow items
 */
function renderItems(items) {
    if (!pickerEl) return;
    const container = pickerEl.querySelector('.picker-items');
    if (!container) return;

    container.innerHTML = '';

    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'picker-item';

        // Split name and description (multiline label)
        const lines = item.label.split('\n');
        const name = lines[0] || '';
        const desc = lines.slice(1).join(' ');

        if (desc) {
            el.innerHTML = `<span class="picker-item-name">/${escapeHtml(name)}</span><span class="picker-item-desc">${escapeHtml(desc)}</span>`;
        } else {
            el.textContent = '/' + name;
        }

        el.onclick = () => selectWorkflow(name, item.domIndex);
        container.appendChild(el);
    });

    pickerEl.classList.add('show');
    pickerVisible = true;
}

/**
 * User selected a workflow — show badge and close picker.
 */
function selectWorkflow(name) {
    selectedWorkflow = { name };
    renderBadge();
    hidePicker();
}

/**
 * Render the workflow badge above the input
 */
function renderBadge() {
    if (!badgeEl || !selectedWorkflow) return;
    badgeEl.innerHTML = `<span class="workflow-badge">⚡ /${escapeHtml(selectedWorkflow.name)}<span class="badge-remove">✕</span></span>`;
    badgeEl.classList.add('show');
    badgeEl.querySelector('.badge-remove')?.addEventListener('click', clearWorkflow);
}

/**
 * Remove the selected workflow badge
 */
export function clearWorkflow() {
    selectedWorkflow = null;
    if (badgeEl) {
        badgeEl.innerHTML = '';
        badgeEl.classList.remove('show');
    }
}

/**
 * Get the selected workflow prefix for message sending.
 * Returns "/{name} " if a workflow is selected, empty string otherwise.
 */
export function getWorkflowPrefix() {
    if (!selectedWorkflow) return '';
    return `/${selectedWorkflow.name} `;
}

/**
 * Hide the picker popup
 */
export function hidePicker() {
    if (pickerEl) pickerEl.classList.remove('show');
    pickerVisible = false;
}

/**
 * Check if picker is currently visible
 */
export function isPickerVisible() {
    return pickerVisible;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}
