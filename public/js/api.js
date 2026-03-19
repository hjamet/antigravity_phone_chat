/**
 * API and Authentication Utilities
 */

export const AUTH_COOKIE_NAME = 'ag_auth_token';

/**
 * Check if the browser has the authentication cookie
 */
export function hasAuthCookie() {
    return document.cookie.includes(`${AUTH_COOKIE_NAME}=`);
}

/**
 * Fetch wrapper with authentication and base URL handling
 */
export async function fetchWithAuth(url, options = {}) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Auto-add auth header if we have a cookie, but skip if local (server bypasses auth for local)
    if (!isLocal && !hasAuthCookie()) {
        console.warn('No auth cookie found. Request might fail.');
    }

    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.reload(); // Trigger re-auth if token expired
        }
        return response;
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        throw error;
    }
}

/**
 * Get the current SSL status banner info
 */
export async function getSSLStatus() {
    try {
        const res = await fetchWithAuth('/ssl-status');
        return await res.json();
    } catch (e) {
        return { isSecure: false, error: e.message };
    }
}
