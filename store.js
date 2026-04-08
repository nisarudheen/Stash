/**
 * STASH — Local Data Store (browser localStorage)
 * No backend required — works on GitHub Pages.
 */

import { auth } from './auth.js';

/* ─── Helpers ─── */
function storeKey() {
  const user = auth.currentUser();
  return 'stash_data_' + (user?.id || 'guest');
}

function load() {
  try {
    const raw = localStorage.getItem(storeKey());
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_DATA);
  } catch { return structuredClone(DEFAULT_DATA); }
}

function save(data) {
  localStorage.setItem(storeKey(), JSON.stringify(data));
  _store = data;
  _emit();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ─── Task date helpers ─── */
export function getWeekLabel(date) {
  const d = new Date(date);
  const day = d.getDay();
  const sun = new Date(d.setDate(d.getDate() - day));
  return 'Week of ' + sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getMonthLabel(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getNextDate(dateStr, period) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const next = new Date(y, mo - 1, d, 12);
  if (period === 'daily') next.setDate(next.getDate() + 1);
  if (period === 'weekly') next.setDate(next.getDate() + 7);
  if (period === 'monthly') next.setMonth(next.getMonth() + 1);
  return next;
}

/* ─── Default state ─── */
const DEFAULT_DATA = {
  income: [], expenses: [], tasks: [], goals: [], credits: []
};

let _store = structuredClone(DEFAULT_DATA);
const _listeners = new Set();

function _emit() { _listeners.forEach(fn => fn(_store)); }

/* ─── Store ─── */
export const store = {
  get() { return _store; },

  async reload() {
    _store = load();
    _emit();
  },

  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  /* ── INCOME ── */
  async addIncome({ type, amount, date, note }) {
    const data = load();
    data.income.unshift({ id: uid(), type, amount: parseFloat(amount), date, note });
    save(data);
  },

  async deleteIncome(id) {
    const data = load();
    data.income = data.income.filter(r => r.id !== id);
    save(data);
  },

  /* ── EXPENSES ── */
  async addExpense({ type, amount, date, note }) {
    const data = load();
    data.expenses.unshift({ id: uid(), type, amount: parseFloat(amount), date, note });
    save(data);
  },

  async deleteExpense(id) {
    const data = load();
    data.expenses = data.expenses.filter(r => r.id !== id);
    save(data);
  },

  /* ── TASKS ── */
  async addTask({ title, period, note, date: customDate }) {
    const d = customDate ? new Date(customDate) : new Date();
    const isoDate = d.toISOString().slice(0, 10);
    const data = load();
    data.tasks.push({
      id: uid(), title, period, note,
      date: isoDate, done: false,
      weekLabel: getWeekLabel(d), monthLabel: getMonthLabel(d)
    });
    save(data);
  },

  async toggleTask(id) {
    const data = load();
    const t = data.tasks.find(x => x.id === id);
    if (t) t.done = !t.done;
    save(data);
  },

  async rolloverTask(id) {
    const data = load();
    const t = data.tasks.find(x => x.id === id);
    if (t) {
      const next = getNextDate(t.date, t.period);
      t.date = next.toISOString().slice(0, 10);
      t.done = false;
      t.weekLabel = getWeekLabel(next);
      t.monthLabel = getMonthLabel(next);
    }
    save(data);
  },

  async rolloverAllTasks(period) {
    const data = load();
    data.tasks.filter(t => t.period === period).forEach(t => {
      const next = getNextDate(t.date, t.period);
      t.date = next.toISOString().slice(0, 10);
      t.done = false;
      t.weekLabel = getWeekLabel(next);
      t.monthLabel = getMonthLabel(next);
    });
    save(data);
  },

  async deleteTask(id) {
    const data = load();
    data.tasks = data.tasks.filter(r => r.id !== id);
    save(data);
  },

  /* ── GOALS ── */
  async addGoal({ title, target, targetDate, unit, currentValue }) {
    const data = load();
    data.goals.push({
      id: uid(), title,
      target: parseFloat(target),
      currentValue: parseFloat(currentValue || 0),
      targetDate: targetDate || null,
      unit: unit || '%',
      done: false
    });
    save(data);
  },

  async updateGoalProgress(id, value) {
    const data = load();
    const g = data.goals.find(x => x.id === id);
    if (g) { g.currentValue = parseFloat(value); g.done = g.currentValue >= g.target; }
    save(data);
  },

  async toggleGoal(id) {
    const data = load();
    const g = data.goals.find(x => x.id === id);
    if (g) g.done = !g.done;
    save(data);
  },

  async deleteGoal(id) {
    const data = load();
    data.goals = data.goals.filter(r => r.id !== id);
    save(data);
  },

  /* ── CREDITS ── */
  async addCredit({ person, amount, note, date, type }) {
    const data = load();
    data.credits.unshift({
      id: uid(), person, amount: parseFloat(amount), note, date,
      type: type || 'lent', repaid: false
    });
    save(data);
  },

  async toggleCredit(id) {
    const data = load();
    const c = data.credits.find(x => x.id === id);
    if (c) c.repaid = !c.repaid;
    save(data);
  },

  async deleteCredit(id) {
    const data = load();
    data.credits = data.credits.filter(r => r.id !== id);
    save(data);
  }
};

/* ─── Exported helpers (unchanged from previous version) ─── */

function localDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalDs(val) {
  if (!val) return null;
  if (val instanceof Date) return localDateStr(val);
  if (typeof val === 'string') {
    const datePart = val.includes('T') ? val.split('T')[0] : val;
    const [y, mo, d] = datePart.split('-').map(Number);
    return localDateStr(new Date(y, mo - 1, d, 12, 0, 0));
  }
  return localDateStr(val);
}

export function filterByPeriod(records, period, dateField = 'date') {
  const now = new Date();
  const todayLocal = localDateStr(now);

  return records.filter(r => {
    const raw = r[dateField] || r.created_at;
    const ds = toLocalDs(raw) || todayLocal;
    const [y, mo, d] = ds.split('-').map(Number);
    const localNoon = new Date(y, mo - 1, d, 12, 0, 0);

    switch (period) {
      case 'today': return ds === todayLocal;
      case 'tomorrow': {
        const t = new Date(now); t.setDate(t.getDate() + 1);
        return ds === localDateStr(t);
      }
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
  const filtered = tasks.filter(t => t.period === periodFilter);
  const total = filtered.length;
  const done = filtered.filter(t => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}
