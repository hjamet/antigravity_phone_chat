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
    
    if (projects.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; opacity: 0.6;">No projects found</div>';
        return;
    }

    projects.forEach((project, index) => {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.innerHTML = `
            <div class="project-name">${project.name || project}</div>
            <div class="project-path">${project.path || ''}</div>
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
    } catch (e) {
        console.error('Select project error:', e);
    }
}
