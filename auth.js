/**
 * THE OBSIDIAN LEDGER — Auth Module (API version)
 * Communicates with Node.js backend.
 */

const API_BASE = 'http://localhost:3000/api';
const TOKEN_KEY = 'obsidian_token';
const USER_KEY = 'obsidian_user';

export const auth = {
    /** Returns current logged in user from localStorage cache */
    currentUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY));
        } catch { return null; }
    },

    getToken() {
        return localStorage.getItem(TOKEN_KEY);
    },

    isLoggedIn() {
        return !!this.getToken();
    },

    async register(details) {
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(details)
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, error: data.error };

            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch (err) {
            return { ok: false, error: 'Could not connect to server.' };
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
            if (!res.ok) return { ok: false, error: data.error };

            this._save(data.token, data.user);
            return { ok: true, user: data.user };
        } catch (err) {
            return { ok: false, error: 'Could not connect to server.' };
        }
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        // Also clear the data key from old localStorage version to be clean
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('obsidian_data_')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
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
