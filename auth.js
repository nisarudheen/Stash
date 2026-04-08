/**
 * STASH — Auth Module
 * Calls the Express/MongoDB backend API.
 */

// ── Single place to change the backend URL ──────────────────────────
// After deploying your backend, paste the URL here:
export const API_BASE = 'https://stash-api-backend.onrender.com/api';
// ────────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'stash_token';
const USER_KEY = 'stash_user';

/**
 * fetch with a timeout + one retry.
 * Render.com free-tier servers sleep after inactivity and can take
 * 30-90 s to cold-start, so we give each attempt 35 s before we retry.
 */
async function fetchWithRetry(url, options, timeoutMs = 35000, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            return res;
        } catch (err) {
            clearTimeout(timer);
            if (attempt < retries) {
                // Brief pause before retry
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            throw err;
        }
    }
}

export const auth = {
    currentUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    },

    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    isLoggedIn() {
        return !!this.getToken();
    },

    async register({ firstName, lastName, email, password, currency, occupation }) {
        try {
            const res = await fetchWithRetry(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, password, currency, occupation })
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, error: data.error || 'Registration failed.' };
            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch {
            return { ok: false, error: 'Server is waking up — this can take up to a minute on first use. Please try again in a moment.' };
        }
    },

    async login({ email, password }) {
        try {
            const res = await fetchWithRetry(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, error: data.error || 'Login failed.' };
            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch {
            return { ok: false, error: 'Server is waking up — this can take up to a minute on first use. Please try again in a moment.' };
        }
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },

    _save(token, user) {
        const fn = user.firstName || user.first_name || '';
        const ln = user.lastName || user.last_name || '';
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify({
            ...user,
            firstName: fn,
            lastName: ln,
            avatar: (fn[0] || '').toUpperCase() + (ln[0] || '').toUpperCase()
        }));
    }
};
