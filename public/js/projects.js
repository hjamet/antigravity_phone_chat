/**
 * Project Management Logic
 */

import { fetchWithAuth } from './api.js';
import { elements, toggleModal } from './ui.js';

/**
 * Load and display projects/workspaces
 */
export async function loadProjects() {
    try {
        const res = await fetchWithAuth('/projects');
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
    
    projects.forEach(project => {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.innerHTML = `
            <div class="project-name">${project.name}</div>
            <div class="project-path">${project.path}</div>
        `;
        item.onclick = () => selectProject(project);
        container.appendChild(item);
    });
}

/**
 * Select/Open a project
 */
export async function selectProject(project) {
    toggleModal('project-modal', false);
    try {
        await fetchWithAuth('/open-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
    } catch (e) {
        console.error('Select project error:', e);
    }
}
