import { fetchWithAuth } from './api.js';

let errorBanner = null;

/**
 * Handle a selector error report from the server
 */
export function handleSelectorError(report) {
    // Remove existing banner if any
    if (errorBanner) {
        errorBanner.remove();
    }

    errorBanner = document.createElement('div');
    errorBanner.className = 'selector-error-banner';
    
    errorBanner.innerHTML = `
        <div class="error-header">
            <div class="error-title-group">
                <span class="error-icon">⚠️</span>
                <span class="error-title">Sélecteur CDP Cassé</span>
            </div>
            <button class="error-close" id="closeErrorBanner">✕</button>
        </div>
        <div class="error-body">
            <div class="error-main-info">
                <div class="info-item">
                    <span class="label">Sélecteur</span>
                    <code class="value">${report.selector}</code>
                </div>
                <div class="info-item">
                    <span class="label">Fonction</span>
                    <code class="value">${report.functionName}()</code>
                </div>
            </div>
            
            <div class="error-dom-info">
                <strong>Dernière racine DOM valide :</strong>
                <pre><code>${escapeHtml(report.lastValidRoot || 'Non capturée')}</code></pre>
            </div>
            
            <div class="error-actions">
                <a href="/api/selector-errors/dom" target="_blank" class="error-btn secondary">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Voir DOM complet
                </a>
                <button class="error-btn primary" id="copyLlmReport">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copier rapport LLM
                </button>
                <button class="error-btn success" id="resetPollingBtn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Reprendre Polling
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(errorBanner);
    
    // Animate in
    requestAnimationFrame(() => errorBanner.classList.add('show'));

    // Bind actions
    document.getElementById('closeErrorBanner').onclick = () => {
        errorBanner.classList.remove('show');
        setTimeout(() => { if (errorBanner) errorBanner.remove(); errorBanner = null; }, 300);
    };

    document.getElementById('copyLlmReport').onclick = () => {
        navigator.clipboard.writeText(report.llmPrompt).then(() => {
            const btn = document.getElementById('copyLlmReport');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Copié ✓';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('copied');
            }, 2000);
        });
    };

    document.getElementById('resetPollingBtn').onclick = async () => {
        try {
            await fetchWithAuth('/api/selector-errors/reset', { method: 'POST' });
            document.getElementById('closeErrorBanner').click();
        } catch (e) {
            console.error('Failed to reset polling:', e);
        }
    };
}

/**
 * Simple HTML escaping
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
