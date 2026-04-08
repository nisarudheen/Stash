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
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, password, currency, occupation })
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, error: data.error || 'Registration failed.' };
            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch {
            return { ok: false, error: 'Cannot reach server. Check your internet connection.' };
        }
    },

    async login({ email, password }) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, error: data.error || 'Login failed.' };
            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch {
            return { ok: false, error: 'Cannot reach server. Check your internet connection.' };
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
