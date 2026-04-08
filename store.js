/**
 * THE OBSIDIAN LEDGER - Data Store (API Version)
 * Communicates with PostgreSQL backend.
 */

import { auth } from './auth.js';

const API_BASE = 'http://localhost:3000/api';

/* ─── Task Helpers ─── */
export function getWeekLabel(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Back to Sunday
  const sunday = new Date(d.setDate(diff));
  return 'Week of ' + sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getMonthLabel(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

const DEFAULT_DATA = {
  income: [],
  expenses: [],
  tasks: [],
  goals: [],
  credits: []
};

let _store = structuredClone(DEFAULT_DATA);
const _listeners = new Set();

async function api(path, method = 'GET', body = null) {
  const token = auth.getToken();
  if (!token) return { error: 'No token' };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    return await res.json();
  } catch (err) {
    console.error(`API ${method} ${path} failed:`, err);
    return { error: 'Network error' };
  }
}

export const store = {
  get() { return _store; },

  async reload() {
    const data = await api('/data');
    if (!data.error) {
      _store = data;
      this._emit();
    }
  },

  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  _emit() {
    _listeners.forEach(fn => fn(_store));
  },

  /* ── INCOME ── */
  async addIncome({ type, amount, date, note }) {
    const res = await api('/income', 'POST', { type, amount, date, note });
    if (!res.error) await this.reload();
  },

  async deleteIncome(id) {
    const res = await api(`/income/${id}`, 'DELETE');
    if (!res.error) await this.reload();
  },

  /* ── EXPENSES ── */
  async addExpense({ type, amount, date, note }) {
    const res = await api('/expenses', 'POST', { type, amount, date, note });
    if (!res.error) await this.reload();
  },

  async deleteExpense(id) {
    const res = await api(`/expenses/${id}`, 'DELETE');
    if (!res.error) await this.reload();
  },

  /* ── TASKS ── */
  async addTask({ title, period, note, date: customDate }) {
    const date = customDate ? new Date(customDate) : new Date();
    const isoDate = date.toISOString().slice(0, 10);
    const weekLabel = getWeekLabel(date);
    const monthLabel = getMonthLabel(date);

    const res = await api('/tasks', 'POST', {
      title, period, note,
      date: isoDate, weekLabel, monthLabel
    });
    if (!res.error) await this.reload();
  },

  async toggleTask(id) {
    const res = await api(`/tasks/${id}/toggle`, 'PATCH');
    if (!res.error) await this.reload();
  },

  async rolloverTask(id) {
    const res = await api(`/tasks/${id}/rollover`, 'PATCH');
    if (!res.error) await this.reload();
  },

  async rolloverAllTasks(period) {
    const res = await api('/tasks/rollover-all', 'POST', { period });
    if (!res.error) await this.reload();
  },

  async deleteTask(id) {
    const res = await api(`/tasks/${id}`, 'DELETE');
    if (!res.error) await this.reload();
  },

  /* ── GOALS ── */
  async addGoal({ title, target, targetDate, unit, currentValue }) {
    const res = await api('/goals', 'POST', { title, target, targetDate, unit, currentValue });
    if (!res.error) await this.reload();
  },

  async updateGoalProgress(id, value) {
    const res = await api(`/goals/${id}/progress`, 'PATCH', { currentValue: value });
    if (!res.error) await this.reload();
  },

  async toggleGoal(id) {
    const res = await api(`/goals/${id}/toggle`, 'PATCH');
    if (!res.error) await this.reload();
  },

  async deleteGoal(id) {
    const res = await api(`/goals/${id}`, 'DELETE');
    if (!res.error) await this.reload();
  },

  /* ── CREDITS ── */
  async addCredit({ person, amount, note, date, type }) {
    const res = await api('/credits', 'POST', { person, amount, note, date, type });
    if (!res.error) await this.reload();
  },

  async toggleCredit(id) {
    const res = await api(`/credits/${id}/toggle`, 'PATCH');
    if (!res.error) await this.reload();
  },

  async deleteCredit(id) {
    const res = await api(`/credits/${id}`, 'DELETE');
    if (!res.error) await this.reload();
  }
};

/* ─── Date Helpers ─── */

/** Returns 'YYYY-MM-DD' in LOCAL timezone (not UTC) */
function localDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extract a local YYYY-MM-DD string from a value that may be:
 *   - a YYYY-MM-DD string (from pg DATE column)
 *   - a JS Date object (from pg TIMESTAMPTZ column)
 *   - an ISO timestamp string 'YYYY-MM-DDTHH:...' 
 */
function toLocalDs(val) {
  if (!val) return null;
  if (val instanceof Date) return localDateStr(val);
  if (typeof val === 'string') {
    // Strip time portion to avoid UTC midnight parse issues
    const datePart = val.includes('T') ? val.split('T')[0] : val;
    // Re-parse as local noon to avoid any midnight-UTC edge cases
    const [y, mo, d] = datePart.split('-').map(Number);
    return localDateStr(new Date(y, mo - 1, d, 12, 0, 0));
  }
  return localDateStr(val);
}

export function filterByPeriod(records, period, dateField = 'date') {
  const now = new Date();
  const todayLocal = localDateStr(now); // e.g. '2026-04-03' in IST

  return records.filter(r => {
    // Get the date value; fall back to created_at if date field missing
    const raw = r[dateField] || r.created_at;
    const ds = toLocalDs(raw) || todayLocal;
    // Build a local noon Date for range comparisons (avoids midnight UTC pitfalls)
    const [y, mo, d] = ds.split('-').map(Number);
    const localNoon = new Date(y, mo - 1, d, 12, 0, 0);

    switch (period) {
      case 'today':
        return ds === todayLocal;
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return ds === localDateStr(tomorrow);
      }
      case 'week': {
        const weekStart = startOfWeek(now);
        const weekEnd = new Date(now);
        weekEnd.setHours(23, 59, 59, 999);
        return localNoon >= weekStart && localNoon <= weekEnd;
      }
      case 'next-week': {
        const nextWeekStart = startOfWeek(now);
        nextWeekStart.setDate(nextWeekStart.getDate() + 7);
        const nextWeekEnd = new Date(nextWeekStart);
        nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
        nextWeekEnd.setHours(23, 59, 59, 999);
        return localNoon >= nextWeekStart && localNoon <= nextWeekEnd;
      }
      case 'month':
        return y === now.getFullYear() && (mo - 1) === now.getMonth();
      case 'next-month': {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return y === nextMonth.getFullYear() && (mo - 1) === nextMonth.getMonth();
      }
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        return y === now.getFullYear() && Math.floor((mo - 1) / 3) === q;
      }
      case 'year':
        return y === now.getFullYear();
      default:
        return true;
    }
  });
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sumAmounts(records) {
  return records.reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);
}

export function fmtCurrency(val) {
  const user = auth.currentUser();
  const currency = user?.currency || 'USD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2
  }).format(val || 0);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  let ds = dateStr;
  if (typeof ds === 'string' && ds.includes('T')) ds = ds.split('T')[0];
  const d = new Date(ds);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function computeTaskStats(tasks, periodFilter) {
  const filtered = tasks.filter(t => {
    if (periodFilter === 'daily') return t.period === 'daily';
    if (periodFilter === 'weekly') return t.period === 'weekly';
    if (periodFilter === 'monthly') return t.period === 'monthly';
    return true;
  });
  const total = filtered.length;
  const done = filtered.filter(t => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}


