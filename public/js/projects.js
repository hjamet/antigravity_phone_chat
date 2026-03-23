/**
 * Project Management Logic
 */

import { fetchWithAuth } from './api.js';
import { elements, toggleLayer } from './ui.js';

/**
 * Load and display projects/workspaces
 */
export async function loadProjects() {
    try {
        const res = await fetchWithAuth('/api/projects');
        const data = await res.json();
        
        if (data && Array.isArray(data)) {
            renderProjects(data);
        }
    } catch (e) {
        console.error('Projects load error:', e);
    }
}

/**
 * Render project list into the DOM
 */
function renderProjects(projects) {
    const container = elements.projectList;
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!projects || projects.length === 0) {
        container.innerHTML = `
            <div class="history-state-container">
                <div class="history-state-icon">📁</div>
                <div class="history-state-title">No Workspaces Found</div>
                <div class="history-state-desc">Open a project folder to start chatting with Antigravity.</div>
            </div>`;
        return;
    }

    projects.forEach((project, index) => {
        const item = document.createElement('div');
        item.className = 'project-card';
        item.innerHTML = `
            <div class="project-card-title">${project.name || project}</div>
            <div class="project-card-path">${project.path || 'Workspace'}</div>
        `;
        item.onclick = () => selectProject({ index, name: project.name || project });
        container.appendChild(item);
    });
}

/**
 * Select/Open a project
 */
export async function selectProject(project) {
    toggleLayer(elements.projectsLayer, false);
    try {
        await fetchWithAuth('/api/projects/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
        
        // Emulate the "New Chat" button behavior locally
        // The backend /api/projects/open already triggers a new agent session,
        // so we just need to clear the local UI.
        window.dispatchEvent(new CustomEvent('new-chat-started'));
    } catch (e) {
        console.error('Select project error:', e);
    }
}
