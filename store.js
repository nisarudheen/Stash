/**
 * STASH — Data Store
 * Calls the Express/MongoDB backend API.
 */

import { auth, API_BASE } from './auth.js';

const DEFAULT_DATA = { income: [], expenses: [], tasks: [], goals: [], credits: [] };

let _store = structuredClone(DEFAULT_DATA);
const _listeners = new Set();

async function api(path, method = 'GET', body = null) {
  const token = auth.getToken();
  if (!token) return { error: 'No token' };

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
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

  _emit() { _listeners.forEach(fn => fn(_store)); },

  /* ── INCOME ── */
  async addIncome({ type, amount, date, note }) {
    const res = await api('/income', 'POST', { type, amount, date, note });
    if (!res.error) await this.reload();
  },
  async deleteIncome(id) {
    await api(`/income/${id}`, 'DELETE');
    await this.reload();
  },

  /* ── EXPENSES ── */
  async addExpense({ type, amount, date, note }) {
    const res = await api('/expenses', 'POST', { type, amount, date, note });
    if (!res.error) await this.reload();
  },
  async deleteExpense(id) {
    await api(`/expenses/${id}`, 'DELETE');
    await this.reload();
  },

  /* ── TASKS ── */
  async addTask({ title, period, note, date: customDate }) {
    const date = customDate ? new Date(customDate) : new Date();
    const isoDate = date.toISOString().slice(0, 10);
    const weekLabel = getWeekLabel(date);
    const monthLabel = getMonthLabel(date);
    await api('/tasks', 'POST', { title, period, note, date: isoDate, weekLabel, monthLabel });
    await this.reload();
  },
  async toggleTask(id) {
    await api(`/tasks/${id}/toggle`, 'PATCH');
    await this.reload();
  },
  async rolloverTask(id) {
    await api(`/tasks/${id}/rollover`, 'PATCH');
    await this.reload();
  },
  async rolloverAllTasks(period) {
    await api('/tasks/rollover-all', 'POST', { period });
    await this.reload();
  },
  async deleteTask(id) {
    await api(`/tasks/${id}`, 'DELETE');
    await this.reload();
  },

  /* ── GOALS ── */
  async addGoal({ title, target, targetDate, unit, currentValue }) {
    await api('/goals', 'POST', { title, target, targetDate, unit, currentValue });
    await this.reload();
  },
  async updateGoalProgress(id, value) {
    await api(`/goals/${id}/progress`, 'PATCH', { currentValue: value });
    await this.reload();
  },
  async toggleGoal(id) {
    await api(`/goals/${id}/toggle`, 'PATCH');
    await this.reload();
  },
  async deleteGoal(id) {
    await api(`/goals/${id}`, 'DELETE');
    await this.reload();
  },

  /* ── CREDITS ── */
  async addCredit({ person, amount, note, date, type }) {
    await api('/credits', 'POST', { person, amount, note, date, type });
    await this.reload();
  },
  async toggleCredit(id) {
    await api(`/credits/${id}/toggle`, 'PATCH');
    await this.reload();
  },
  async deleteCredit(id) {
    await api(`/credits/${id}`, 'DELETE');
    await this.reload();
  }
};

/* ─── Date / Format Helpers ─── */

export function getWeekLabel(date) {
  const d = new Date(date);
  const sun = new Date(d.setDate(d.getDate() - d.getDay()));
  return 'Week of ' + sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getMonthLabel(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function localDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalDs(val) {
  if (!val) return null;
  if (val instanceof Date) return localDateStr(val);
  const datePart = typeof val === 'string' && val.includes('T') ? val.split('T')[0] : val;
  const [y, mo, d] = String(datePart).split('-').map(Number);
  return localDateStr(new Date(y, mo - 1, d, 12));
}

export function filterByPeriod(records, period, dateField = 'date') {
  const now = new Date();
  const todayLocal = localDateStr(now);

  return records.filter(r => {
    const raw = r[dateField] || r.created_at;
    const ds = toLocalDs(raw) || todayLocal;
    const [y, mo, d] = ds.split('-').map(Number);
    const localNoon = new Date(y, mo - 1, d, 12);

    switch (period) {
      case 'today': return ds === todayLocal;
      case 'tomorrow': { const t = new Date(now); t.setDate(t.getDate() + 1); return ds === localDateStr(t); }
      case 'week': {
        const ws = startOfWeek(now);
        const we = new Date(now); we.setHours(23, 59, 59, 999);
        return localNoon >= ws && localNoon <= we;
      }
      case 'next-week': {
        const nws = startOfWeek(now); nws.setDate(nws.getDate() + 7);
        const nwe = new Date(nws); nwe.setDate(nwe.getDate() + 6); nwe.setHours(23, 59, 59, 999);
        return localNoon >= nws && localNoon <= nwe;
      }
      case 'month': return y === now.getFullYear() && (mo - 1) === now.getMonth();
      case 'next-month': {
        const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return y === nm.getFullYear() && (mo - 1) === nm.getMonth();
      }
      case 'quarter': {
        const q = Math.floor(now.getMonth() / 3);
        return y === now.getFullYear() && Math.floor((mo - 1) / 3) === q;
      }
      case 'year': return y === now.getFullYear();
      default: return true;
    }
  });
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sumAmounts(records) {
  return records.reduce((a, r) => a + parseFloat(r.amount || 0), 0);
}

export function fmtCurrency(val) {
  const currency = auth.currentUser()?.currency || 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(val || 0);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const ds = typeof dateStr === 'string' && dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const d = new Date(ds);
  return isNaN(d) ? String(dateStr) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function computeTaskStats(tasks, periodFilter) {
  const filtered = tasks.filter(t => t.period === periodFilter);
  const total = filtered.length;
  const done = filtered.filter(t => t.done).length;
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
