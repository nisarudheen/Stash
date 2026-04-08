/**
 * STASH — Local Auth (browser localStorage only)
 * No backend required — works on GitHub Pages.
 */

const TOKEN_KEY = 'stash_token';
const USER_KEY = 'stash_user';
const USERS_KEY = 'stash_users_db';

/* helpers */
function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; } catch { return {}; }
}
function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** super-simple hashing (bcrypt-like feel) — good enough for local storage */
async function hashPassword(pw) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode('stash_salt_:' + pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(pw, hash) {
    return (await hashPassword(pw)) === hash;
}

function makeToken(userId) {
    return btoa(JSON.stringify({ userId, ts: Date.now() }));
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
        const users = getUsers();
        const key = email.toLowerCase().trim();

        if (users[key]) {
            return { ok: false, error: 'An account with this email already exists.' };
        }

        const passwordHash = await hashPassword(password);
        const id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2);

        const user = { id, firstName, lastName, email: key, currency: currency || 'USD', occupation: occupation || '' };
        users[key] = { ...user, passwordHash };
        saveUsers(users);

        const token = makeToken(id);
        this._save(token, user);
        return { ok: true, user };
    },

    async login({ email, password }) {
        const users = getUsers();
        const key = email.toLowerCase().trim();
        const stored = users[key];

        if (!stored) return { ok: false, error: 'Invalid email or password.' };

        const valid = await verifyPassword(password, stored.passwordHash);
        if (!valid) return { ok: false, error: 'Invalid email or password.' };

        const { passwordHash, ...user } = stored;
        const token = makeToken(user.id);
        this._save(token, user);
        return { ok: true, user };
    },

    logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    },

    _save(token, user) {
        const fn = user.firstName || '';
        const ln = user.lastName || '';
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify({
            ...user,
            firstName: fn,
            lastName: ln,
            avatar: (fn[0] || '').toUpperCase() + (ln[0] || '').toUpperCase()
        }));
    }
};
