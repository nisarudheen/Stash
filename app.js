/**
 * THE OBSIDIAN LEDGER — Main Application Logic
 * Pure ES Module, no build step required.
 */

import { store, filterByPeriod, sumAmounts, fmtCurrency, fmtDate, computeTaskStats } from './store.js';

/* ═══════════════════════════════════
   STATE
═══════════════════════════════════ */
let activePage = 'finance';
let activePeriod = 'today';
let activeEntryType = 'income';
let activeCreditFilter = 'all';

/** Returns 'YYYY-MM-DD' in the LOCAL timezone */
function localDateStr(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ═══════════════════════════════════
   NAVIGATION
═══════════════════════════════════ */
window.navigate = function (page) {
  activePage = page;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  // Update navigation items (Desktop & Mobile)
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.remove('active'));

  const navItem = document.getElementById('nav-' + page);
  if (navItem) navItem.classList.add('active');

  const mobItem = document.getElementById('mob-' + page);
  if (mobItem) mobItem.classList.add('active');

  // Refresh view
  renderAll();
};

// Sidebar nav
document.getElementById('sidebar-nav').addEventListener('click', e => {
  const item = e.target.closest('[data-page]');
  if (item) navigate(item.dataset.page);
});

/* ═══════════════════════════════════
   PERIOD FILTER
═══════════════════════════════════ */
document.getElementById('period-filter').addEventListener('click', e => {
  const btn = e.target.closest('[data-period]');
  if (!btn) return;
  activePeriod = btn.dataset.period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderAll();
});

/* ═══════════════════════════════════
   ENTRY TYPE SELECTOR
═══════════════════════════════════ */
document.getElementById('entry-type-selector').addEventListener('click', e => {
  const btn = e.target.closest('[data-type]');
  if (!btn) return;
  selectEntryType(btn.dataset.type);
});

window.selectEntryType = function (type) {
  activeEntryType = type;
  const typeMap = { income: 'selected-income', expense: 'selected-expense', task: 'selected-task', goal: 'selected-goal', credit: 'selected-credit' };

  document.querySelectorAll('.type-btn').forEach(b => {
    b.className = b.className.replace(/selected-\w+/, '').trim();
    if (b.dataset.type === type) b.classList.add(typeMap[type]);
  });

  ['income', 'expense', 'task', 'goal', 'credit'].forEach(t => {
    const el = document.getElementById('form-' + t);
    if (el) el.style.display = (t === type) ? 'block' : 'none';
  });
}

/* ═══════════════════════════════════
   MODALS
═══════════════════════════════════ */
window.openModal = function (id) {
  document.getElementById(id).classList.add('open');
};

window.closeModal = function (id) {
  document.getElementById(id).classList.remove('open');
};

window.handleOverlayClick = function (e, id) {
  if (e.target.classList.contains('overlay')) closeModal(id);
};

/* ═══════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════ */
function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="material-symbols-outlined">${type === 'success' ? 'check_circle' : 'error'}</span>${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ═══════════════════════════════════
   FORM SUBMISSIONS
═══════════════════════════════════ */
window.submitIncome = function () {
  const amount = document.getElementById('income-amount').value;
  const type = document.getElementById('income-type').value;
  const date = document.getElementById('income-date').value;
  const note = document.getElementById('income-note').value;

  if (!amount || parseFloat(amount) <= 0) { toast('Please enter a valid amount.', 'error'); return; }
  if (!date) { toast('Please select a date.', 'error'); return; }

  store.addIncome({ type, amount, date, note });
  clearEntryForm();
  toast(`Income of ${fmtCurrency(amount)} saved!`);
  renderAll();
};

window.submitExpense = function () {
  const amount = document.getElementById('expense-amount').value;
  const type = document.getElementById('expense-type').value;
  const date = document.getElementById('expense-date').value;
  const note = document.getElementById('expense-note').value;

  if (!amount || parseFloat(amount) <= 0) { toast('Please enter a valid amount.', 'error'); return; }
  if (!date) { toast('Please select a date.', 'error'); return; }

  store.addExpense({ type, amount, date, note });
  clearEntryForm();
  toast(`Expense of ${fmtCurrency(amount)} saved!`);
  renderAll();
};

window.submitTask = function () {
  const title = document.getElementById('task-title').value.trim();
  const period = document.getElementById('task-period').value;
  const note = document.getElementById('task-note').value;

  if (!title) { toast('Please enter a task title.', 'error'); return; }

  let customDate = null;
  if (activePeriod === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    customDate = d.toISOString().slice(0, 10);
  } else if (activePeriod === 'next-week') {
    const d = new Date(); d.setDate(d.getDate() + 7);
    customDate = d.toISOString().slice(0, 10);
  } else if (activePeriod === 'next-month') {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1);
    customDate = d.toISOString().slice(0, 10);
  }

  store.addTask({ title, period, note, date: customDate });
  clearEntryForm();
  toast(`Task "${title}" saved!`);
  renderAll();
};

window.submitGoal = function () {
  const title = document.getElementById('goal-title').value.trim();
  const target = document.getElementById('goal-target').value;
  const unit = document.getElementById('goal-unit').value || '%';
  const currentValue = document.getElementById('goal-current').value;
  const targetDate = document.getElementById('goal-target-date').value;

  if (!title) { toast('Please enter a goal title.', 'error'); return; }
  if (!target || parseFloat(target) <= 0) { toast('Please enter a valid target.', 'error'); return; }

  store.addGoal({ title, target, unit, currentValue, targetDate });
  clearEntryForm();
  toast(`Goal "${title}" saved!`);
  renderAll();
};

// Modal submissions
window.submitModalGoal = function () {
  const title = document.getElementById('modal-goal-title').value.trim();
  const target = document.getElementById('modal-goal-target').value;
  const unit = document.getElementById('modal-goal-unit').value || '%';
  const currentValue = document.getElementById('modal-goal-current').value;
  const targetDate = document.getElementById('modal-goal-date').value;

  if (!title) { toast('Please enter a goal title.', 'error'); return; }
  if (!target || parseFloat(target) <= 0) { toast('Please enter a valid target.', 'error'); return; }

  store.addGoal({ title, target, unit, currentValue, targetDate });
  closeModal('modal-goal');
  ['modal-goal-title', 'modal-goal-target', 'modal-goal-unit', 'modal-goal-current', 'modal-goal-date'].forEach(id => document.getElementById(id).value = '');
  toast(`Goal "${title}" saved!`);
  renderAll();
};

window.submitModalTask = function () {
  const title = document.getElementById('modal-task-title').value.trim();
  const period = document.getElementById('modal-task-period').value;
  const note = document.getElementById('modal-task-note').value;

  if (!title) { toast('Please enter a task title.', 'error'); return; }

  let customDate = null;
  if (activePeriod === 'tomorrow') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    customDate = d.toISOString().slice(0, 10);
  } else if (activePeriod === 'next-week') {
    const d = new Date(); d.setDate(d.getDate() + 7);
    customDate = d.toISOString().slice(0, 10);
  } else if (activePeriod === 'next-month') {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(1);
    customDate = d.toISOString().slice(0, 10);
  }

  store.addTask({ title, period, note, date: customDate });
  closeModal('modal-task');
  ['modal-task-title', 'modal-task-note'].forEach(id => document.getElementById(id).value = '');
  toast(`Task "${title}" saved!`);
  renderAll();
};

window.openGoalProgress = function (id) {
  const g = store.get().goals.find(x => x.id === id);
  if (!g) return;
  document.getElementById('modal-progress-goal-id').value = id;
  document.getElementById('modal-progress-value').value = g.currentValue;
  document.getElementById('goal-progress-info').textContent = `Goal: "${g.title}" — Target: ${g.target} ${g.unit}`;
  openModal('modal-goal-progress');
};

window.saveGoalProgress = function () {
  const id = document.getElementById('modal-progress-goal-id').value;
  const val = document.getElementById('modal-progress-value').value;
  store.updateGoalProgress(id, val);
  closeModal('modal-goal-progress');
  toast('Goal progress updated!');
  renderAll();
};

window.clearEntryForm = function () {
  const ids = ['income-amount', 'income-date', 'income-note', 'expense-amount', 'expense-date', 'expense-note',
    'task-title', 'task-note', 'goal-title', 'goal-target', 'goal-unit', 'goal-current', 'goal-target-date',
    'credit-amount', 'credit-person', 'credit-date', 'credit-note'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};

/* ═══════════════════════════════════
   TOGGLE / DELETE ACTIONS
═══════════════════════════════════ */
window.toggleTask = function (id) {
  store.toggleTask(id);
  renderAll();
};

window.rolloverTask = function (id) {
  store.rolloverTask(id);
  toast('Task moved to next period.');
  renderAll();
};

window.rolloverAll = function (period) {
  store.rolloverAllTasks(period);
  toast(`All ${period} tasks moved to next period.`);
  renderAll();
};

window.deleteTask = function (id) {
  store.deleteTask(id);
  toast('Task deleted.', 'error');
  renderAll();
};

window.toggleGoal = function (id) {
  store.toggleGoal(id);
  renderAll();
};

window.deleteGoal = function (id) {
  store.deleteGoal(id);
  toast('Goal deleted.', 'error');
  renderAll();
};

window.deleteIncome = function (id) {
  store.deleteIncome(id);
  toast('Income entry deleted.', 'error');
  renderAll();
};

window.deleteExpense = function (id) {
  store.deleteExpense(id);
  toast('Expense entry deleted.', 'error');
  renderAll();
};

/* ── CREDITS ACTIONS ── */
window.submitCredit = async function (source = 'modal') {
  const prefix = source === 'modal' ? 'modal-credit-' : 'credit-';
  const person = document.getElementById(prefix + 'person').value.trim();
  const amount = document.getElementById(prefix + 'amount').value;
  const type = document.getElementById(prefix + 'type').value;
  const date = document.getElementById(prefix + 'date').value;
  const note = document.getElementById(prefix + 'note').value;

  if (!person) { toast('Please enter a person or party name.', 'error'); return; }
  if (!amount || parseFloat(amount) <= 0) { toast('Please enter a valid amount.', 'error'); return; }
  if (!date) { toast('Please select a date.', 'error'); return; }

  await store.addCredit({ person, amount, note, date, type });
  if (source === 'modal') {
    closeModal('modal-credit');
  } else {
    clearEntryForm();
  }

  // Clear modal fields specifically if they were used
  if (source === 'modal') {
    ['modal-credit-person', 'modal-credit-amount', 'modal-credit-note', 'modal-credit-date'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  }

  if (activePage !== 'credits') navigate('credits');
  toast(`${type === 'lent' ? 'Lent' : 'Borrowed'} ${fmtCurrency(amount)} record saved!`);
};

window.toggleCredit = async function (id) {
  await store.toggleCredit(id);
  renderAll();
};

window.deleteCredit = async function (id) {
  await store.deleteCredit(id);
  toast('Credit record deleted.', 'error');
  renderAll();
};

window.setCreditFilter = function (filter) {
  activeCreditFilter = filter;
  ['all', 'lent', 'borrowed', 'pending'].forEach(f => {
    const btn = document.getElementById('credit-filter-' + f);
    if (btn) btn.classList.toggle('active', f === filter);
  });
  renderCreditsPage();
};

/* ═══════════════════════════════════
   RING HELPER
═══════════════════════════════════ */
function setRing(elId, pct) {
  const el = document.getElementById(elId);
  if (!el) return;
  const circumference = 201;
  const offset = circumference - (pct / 100) * circumference;
  el.style.strokeDashoffset = offset;
}

/* ═══════════════════════════════════
   RENDER: FINANCE PAGE
═══════════════════════════════════ */
function renderFinancePage() {
  const data = store.get();
  const filteredIncome = filterByPeriod(data.income, activePeriod);
  const filteredExpense = filterByPeriod(data.expenses, activePeriod);

  const totalIncome = sumAmounts(filteredIncome);
  const totalExpense = sumAmounts(filteredExpense);
  const net = totalIncome - totalExpense;
  const isPositive = net >= 0;

  // Net position
  const netEl = document.getElementById('net-position-val');
  netEl.textContent = fmtCurrency(Math.abs(net));
  netEl.style.color = isPositive ? 'var(--color-on-surface)' : 'var(--color-tertiary)';

  const badge = document.getElementById('net-badge');
  badge.className = 'badge ' + (isPositive ? 'badge-success' : 'badge-warning');
  badge.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px;">${isPositive ? 'trending_up' : 'trending_down'}</span>${isPositive ? 'Positive' : 'Deficit'}`;

  // Ring
  const maxVal = Math.max(totalIncome, 1);
  const netPct = Math.min(Math.max((net / maxVal) * 100, 0), 100);
  setRing('net-ring', netPct);
  document.getElementById('net-ring-label').textContent = isPositive ? '+' : '-';

  // Income / Expense cards
  document.getElementById('total-income-val').textContent = fmtCurrency(totalIncome);
  document.getElementById('total-expense-val').textContent = fmtCurrency(totalExpense);
  document.getElementById('income-entries-label').textContent = `${filteredIncome.length} entries`;
  document.getElementById('expense-entries-label').textContent = `${filteredExpense.length} entries`;

  // Progress bars relative to each other
  if (totalIncome > 0) {
    document.getElementById('income-fill').style.width = '100%';
    document.getElementById('expense-fill').style.width = Math.min((totalExpense / totalIncome) * 100, 100) + '%';
  } else {
    document.getElementById('income-fill').style.width = '0%';
    document.getElementById('expense-fill').style.width = totalExpense > 0 ? '100%' : '0%';
  }

  // Today stats (always today regardless of period filter)
  const todayIncome = sumAmounts(filterByPeriod(data.income, 'today'));
  const todayExpense = sumAmounts(filterByPeriod(data.expenses, 'today'));
  document.getElementById('today-income-val').textContent = fmtCurrency(todayIncome);
  document.getElementById('today-expense-val').textContent = fmtCurrency(todayExpense);

  // Task count
  const todayTasks = data.tasks.filter(t => t.period === 'daily');
  const doneTasks = todayTasks.filter(t => t.done).length;
  document.getElementById('tasks-done-val').textContent = `${doneTasks}/${todayTasks.length}`;
  document.getElementById('goals-active-val').textContent = data.goals.filter(g => !g.done).length;

  // Mini bars (monthly income breakdown by week)
  renderMiniBars();

  // Transaction list
  renderTransactionList(data, filteredIncome, filteredExpense);
}

function renderMiniBars() {
  const data = store.get();
  const bars = document.getElementById('finance-mini-bars');
  if (!bars) return;

  // Get last 12 weeks of net data
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weeks.push(localDateStr(d));
  }

  // Simple: just show income by week label
  const allIncome = data.income;
  const allExpense = data.expenses;
  const weekNets = weeks.map(wDate => {
    const wEnd = new Date(wDate);
    wEnd.setDate(wEnd.getDate() + 7);
    const wEndStr = localDateStr(wEnd);
    const wIncome = allIncome.filter(r => (r.date || '') >= wDate && (r.date || '') < wEndStr);
    const wExpense = allExpense.filter(r => (r.date || '') >= wDate && (r.date || '') < wEndStr);
    return sumAmounts(wIncome) - sumAmounts(wExpense);
  });

  const max = Math.max(...weekNets.map(Math.abs), 1);

  bars.innerHTML = weekNets.map((net, i) => {
    const h = Math.max((Math.abs(net) / max) * 100, 4);
    const isLast = i === weekNets.length - 1;
    const col = net >= 0 ? (isLast ? 'rgba(170,199,255,0.8)' : 'rgba(170,199,255,0.2)') : 'rgba(255,84,71,0.3)';
    return `<div class="mini-bar" style="height:${h}%;background:${col};border-radius:3px 3px 0 0;flex:1;"></div>`;
  }).join('');
}

function renderTransactionList(data, filteredIncome, filteredExpense) {
  const el = document.getElementById('finance-tx-list');
  if (!el) return;

  const ICONS = {
    'Salary & Wages': 'work', 'Freelance Work': 'laptop', 'Investment Return': 'trending_up',
    'Business Income': 'store', 'Dividends': 'account_balance', 'Rental Income': 'home',
    'Side Project': 'code', 'Gift / Other': 'redeem',
    'Rent & Mortgage': 'home', 'Food & Dining': 'restaurant', 'Transportation': 'directions_car',
    'Utilities & Bills': 'bolt', 'Healthcare': 'medical_services', 'Entertainment': 'movie',
    'Shopping': 'shopping_bag', 'Subscriptions': 'subscriptions', 'Travel': 'flight_takeoff',
    'Education': 'school', 'Personal Care': 'spa', 'Other': 'more_horiz'
  };

  const incomeItems = filteredIncome.map(r => ({ ...r, isIncome: true }));
  const expenseItems = filteredExpense.map(r => ({ ...r, isIncome: false }));
  const all = [...incomeItems, ...expenseItems]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 15);

  if (all.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">receipt_long</span>
      <strong>No transactions</strong>
      <p>Add your first income or expense entry to get started.</p>
    </div>`;
    return;
  }

  el.innerHTML = all.map(r => `
    <div class="transaction-item" onclick="${r.isIncome ? 'deleteIncome' : 'deleteExpense'}('${r.id}')" title="Delete record">
      <div class="tx-main">
        <div class="tx-icon">
          <span class="material-symbols-outlined">${ICONS[r.type] || 'payments'}</span>
        </div>
        <div class="tx-info">
          <div class="tx-name">${r.type}</div>
          <div class="tx-sub">${r.note || fmtDate(r.date)}</div>
        </div>
      </div>
      <div class="tx-meta">
        <span class="badge ${r.isIncome ? 'badge-success' : 'badge-neutral'}">${r.isIncome ? 'Income' : 'Expense'}</span>
        <div class="tx-amount ${r.isIncome ? 'income' : 'expense'}">${r.isIncome ? '+' : '-'}${fmtCurrency(r.amount)}</div>
        <div class="tx-date">${fmtDate(r.date)}</div>
        <span class="material-symbols-outlined tx-delete-hint" style="font-size:16px;color:var(--color-outline);opacity:0.4;">delete</span>
      </div>
    </div>
  `).join('');
}


/* ═══════════════════════════════════
   RENDER: ANALYTICS PAGE
═══════════════════════════════════ */
function renderAnalyticsPage() {
  const data = store.get();
  const filteredIncome = filterByPeriod(data.income, activePeriod);
  const filteredExpense = filterByPeriod(data.expenses, activePeriod);

  const totalIncome = sumAmounts(filteredIncome);
  const totalExpense = sumAmounts(filteredExpense);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((net / totalIncome) * 100)) : 0;

  document.getElementById('analytics-income').textContent = fmtCurrency(totalIncome);
  document.getElementById('analytics-expense').textContent = fmtCurrency(totalExpense);
  document.getElementById('analytics-net').textContent = fmtCurrency(net);
  document.getElementById('savings-rate-val').textContent = savingsRate + '%';

  // Donut
  const circumference = 251.2;
  const expensePct = totalIncome > 0 ? Math.min(totalExpense / totalIncome, 1) : 0;
  const savingsPct = Math.max(0, 1 - expensePct);
  const expenseOffset = circumference - expensePct * circumference;
  const savingsOffset = circumference - savingsPct * circumference;

  const donutExpense = document.getElementById('donut-expense');
  const donutSavings = document.getElementById('donut-savings');
  if (donutExpense) donutExpense.style.strokeDashoffset = expenseOffset;
  if (donutSavings) donutSavings.style.strokeDashoffset = savingsOffset;

  // Income Breakdown by type
  renderBreakdown('income-breakdown', filteredIncome, totalIncome, false);
  renderBreakdown('expense-breakdown', filteredExpense, totalExpense, true);
}

function renderBreakdown(containerId, records, total, isBad) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (records.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:24px;"><span class="material-symbols-outlined">bar_chart</span><p>No data for this period</p></div>`;
    return;
  }

  // Group by type
  const groups = {};
  records.forEach(r => {
    groups[r.type] = (groups[r.type] || 0) + r.amount;
  });

  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const color = isBad ? 'var(--color-tertiary-container)' : 'var(--color-secondary)';
  const labelColor = isBad ? 'var(--color-tertiary)' : 'var(--color-secondary)';

  el.innerHTML = sorted.map(([type, amount]) => {
    const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
    return `<div class="breakdown-item">
      <div class="breakdown-row">
        <span>${type}</span>
        <span>${fmtCurrency(amount)}</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%;background:${color};border-radius:9999px;height:100%;transition:width .6s cubic-bezier(.16,1,.3,1);"></div>
      </div>
      <div class="breakdown-meta">
        <span>${pct}% of total</span>
        <span style="color:${labelColor};">${pct > 50 ? 'Major' : pct > 20 ? 'Moderate' : 'Minor'}</span>
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════
   RENDER: GOALS PAGE
═══════════════════════════════════ */
function renderGoalsPage() {
  const data = store.get();

  // Task rings
  const dailyStats = computeTaskStats(data.tasks, 'daily');
  const weeklyStats = computeTaskStats(data.tasks, 'weekly');
  const monthlyStats = computeTaskStats(data.tasks, 'monthly');

  document.getElementById('goals-daily-pct').textContent = dailyStats.pct + '%';
  document.getElementById('goals-weekly-pct').textContent = weeklyStats.pct + '%';
  document.getElementById('goals-monthly-pct').textContent = monthlyStats.pct + '%';
  setRing('ring-daily', dailyStats.pct);
  setRing('ring-weekly', weeklyStats.pct);
  setRing('ring-monthly', monthlyStats.pct);

  const setRingLabel = (id, stats) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${stats.done}/${stats.total}`;
  };
  setRingLabel('ring-daily-label', dailyStats);
  setRingLabel('ring-weekly-label', weeklyStats);
  setRingLabel('ring-monthly-label', monthlyStats);

  // Goals grid
  renderGoalsGrid('goals-grid', data.goals);

  // Badges
  renderBadges(data);

  // Streak
  updateStreak(data);
}

function renderGoalsGrid(containerId, goals) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (goals.length === 0) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <span class="material-symbols-outlined">flag</span>
      <strong>No goals yet</strong>
      <p>Add your first goal to start tracking your progress.</p>
    </div>`;
    return;
  }

  el.innerHTML = goals.map(g => {
    const pct = Math.min(Math.round((g.currentValue / g.target) * 100), 100);
    const color = g.done ? 'var(--color-secondary)' : 'var(--color-primary)';
    const icon = g.done ? 'check_circle' : 'flag';
    return `<div class="goal-card">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">
        <div class="goal-icon" style="background:rgba(170,199,255,0.08);">
          <span class="material-symbols-outlined" style="font-size:20px;color:${color};font-variation-settings:'FILL' 1;">${icon}</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g.title}</div>
          <div style="font-size:11px;color:var(--color-on-surface-variant);margin-top:2px;">${g.targetDate ? 'Target: ' + fmtDate(g.targetDate) : 'No deadline'}</div>
        </div>
        <button onclick="deleteGoal('${g.id}')" style="background:none;border:none;cursor:pointer;color:var(--color-outline);flex-shrink:0;" 
          onmouseover="this.style.color='var(--color-tertiary)'" onmouseout="this.style.color='var(--color-outline)'">
          <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
        </button>
      </div>
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;">
          <span style="font-weight:600;">${g.currentValue} / ${g.target} ${g.unit}</span>
          <span style="color:var(--color-on-surface-variant);">${pct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;">
        <button onclick="openGoalProgress('${g.id}')" class="btn" style="padding:6px 12px;font-size:11px;background:rgba(170,199,255,0.1);color:var(--color-primary);flex:1;">Update Progress</button>
        <button onclick="toggleGoal('${g.id}')" class="btn" style="padding:6px 12px;font-size:11px;background:${g.done ? 'rgba(71,226,102,0.1)' : 'var(--color-surface-container-high)'};color:${g.done ? 'var(--color-secondary)' : 'var(--color-on-surface-variant)'};">
          ${g.done ? '✓ Done' : 'Mark Done'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function renderBadges(data) {
  const el = document.getElementById('badges-grid');
  if (!el) return;

  const allGoals = data.goals;
  const allTasks = data.tasks;
  const doneGoals = allGoals.filter(g => g.done).length;
  const doneTasks = allTasks.filter(t => t.done).length;

  const BADGES = [
    { icon: 'military_tech', label: 'Master\nSaver', earned: doneGoals >= 1, color: 'var(--color-secondary)' },
    { icon: 'stars', label: '30 Day\nStreak', earned: doneTasks >= 30, color: 'var(--color-primary)' },
    { icon: 'workspace_premium', label: 'Elite\nPlanner', earned: allGoals.length >= 3, color: 'var(--color-tertiary)' },
    { icon: 'local_fire_department', label: 'On Fire', earned: doneTasks >= 10, color: '#ff7043' },
    { icon: 'diamond', label: 'Diamond\nFinisher', earned: doneGoals >= 5, color: '#40c4ff' },
    { icon: 'emoji_events', label: 'Goal\nMaster', earned: doneGoals >= 10, color: '#ffd740' },
  ];

  el.innerHTML = BADGES.map(b => `
    <div class="badge-tile" title="${b.earned ? 'Earned!' : 'Not earned yet'}">
      <span class="material-symbols-outlined" style="font-size:28px;color:${b.earned ? b.color : 'var(--color-outline-variant)'};">${b.icon}</span>
      <span style="color:${b.earned ? 'var(--color-on-surface)' : '#52525b'};white-space:pre-line;">${b.label}</span>
      ${b.earned ? '<span style="font-size:8px;font-weight:700;color:var(--color-secondary);text-transform:uppercase;letter-spacing:.08em;">Earned</span>' : ''}
    </div>
  `).join('');
}

function updateStreak(data) {
  // Count consecutive days with at least one task done
  const doneByDate = {};
  data.tasks.filter(t => t.done && t.date).forEach(t => { doneByDate[t.date] = true; });

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = localDateStr(d);
    if (doneByDate[key]) streak++;
    else if (i > 0) break;
  }

  document.getElementById('streak-days').textContent = streak;
  const msgs = [
    'Complete daily tasks to build your streak!',
    'Great start! Keep going!',
    'You\'re on a roll! Don\'t break the chain.',
    'Impressive! You\'re building strong habits.',
    'Outstanding discipline! You\'re unstoppable.'
  ];
  document.getElementById('streak-message').textContent = msgs[Math.min(Math.floor(streak / 3), msgs.length - 1)];
}

/* ═══════════════════════════════════
   RENDER: TASKS PAGE
═══════════════════════════════════ */
function renderTasksPage() {
  const data = store.get();
  const filteredTasks = filterByPeriod(data.tasks, activePeriod);

  // Date display
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  document.getElementById('today-weekday').textContent = days[now.getDay()];
  document.getElementById('today-date-display').textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Velocity (daily tasks)
  const dailyTasks = filteredTasks.filter(t => t.period === 'daily');
  const doneDailyTasks = dailyTasks.filter(t => t.done).length;
  const pct = dailyTasks.length > 0 ? Math.round((doneDailyTasks / dailyTasks.length) * 100) : 0;
  document.getElementById('velocity-pct').textContent = pct;
  document.getElementById('velocity-label').textContent = `${doneDailyTasks} of ${dailyTasks.length} tasks completed`;
  document.getElementById('velocity-bar').style.width = pct + '%';

  // Render task columns
  renderTaskColumn('tasks-daily', 'daily-count-badge', filteredTasks.filter(t => t.period === 'daily'));
  renderTaskColumn('tasks-weekly', 'weekly-count-badge', filteredTasks.filter(t => t.period === 'weekly'));
  renderTaskColumn('tasks-monthly', 'monthly-count-badge', filteredTasks.filter(t => t.period === 'monthly'));
}

function renderTaskColumn(containerId, badgeId, tasks) {
  const el = document.getElementById(containerId);
  const badge = document.getElementById(badgeId);
  if (!el) return;
  if (badge) badge.textContent = tasks.length;

  if (tasks.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px;">
      <span class="material-symbols-outlined">checklist</span>
      <p>No tasks yet. Add one!</p>
    </div>`;
    return;
  }

  el.innerHTML = tasks.map(t => `
    <div class="task-card ${t.done ? 'completed' : ''}">
      <div class="task-checkbox ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.id}')">
        ${t.done ? '<span class="material-symbols-outlined">check</span>' : ''}
      </div>
      <div style="flex:1;min-width:0;">
        <div class="task-text">${t.title}</div>
        ${t.note ? `<div class="task-meta">${t.note}</div>` : ''}
        ${t.done ? '<div class="task-meta" style="color:var(--color-secondary);">✓ Completed</div>' : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button onclick="rolloverTask('${t.id}')" title="Move to next ${t.period}" style="background:none;border:none;cursor:pointer;color:var(--color-primary);opacity:0.6;"
          onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
          <span class="material-symbols-outlined" style="font-size:18px;">event_repeat</span>
        </button>
        <button onclick="deleteTask('${t.id}')" style="background:none;border:none;cursor:pointer;color:var(--color-outline);"
          onmouseover="this.style.color='var(--color-tertiary)'" onmouseout="this.style.color='var(--color-outline)'">
          <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

/* ═══════════════════════════════════
   RENDER: ACHIEVEMENTS PAGE
═══════════════════════════════════ */
function renderAchievementsPage() {
  const data = store.get();

  const renderAchRingAndLabel = (ringId, pctId, labelId, stats) => {
    setRing(ringId, stats.pct);
    const pctEl = document.getElementById(pctId);
    const lblEl = document.getElementById(labelId);
    if (pctEl) pctEl.textContent = stats.pct + '%';
    if (lblEl) lblEl.textContent = `${stats.done} / ${stats.total} done`;
  };

  const daily = computeTaskStats(data.tasks, 'daily');
  const weekly = computeTaskStats(data.tasks, 'weekly');
  const monthly = computeTaskStats(data.tasks, 'monthly');

  renderAchRingAndLabel('ach-ring-daily', 'ach-daily-pct', 'ach-daily-label', daily);
  renderAchRingAndLabel('ach-ring-weekly', 'ach-weekly-pct', 'ach-weekly-label', weekly);
  renderAchRingAndLabel('ach-ring-monthly', 'ach-monthly-pct', 'ach-monthly-label', monthly);

  // Task lists
  renderAchTaskList('ach-daily-list', data.tasks.filter(t => t.period === 'daily'));
  renderAchTaskList('ach-weekly-list', data.tasks.filter(t => t.period === 'weekly'));
  renderAchTaskList('ach-monthly-list', data.tasks.filter(t => t.period === 'monthly'));

  // Goals achievement
  renderAchGoals('ach-goals-list', data.goals);
}

function renderAchTaskList(containerId, tasks) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (tasks.length === 0) {
    el.innerHTML = `<div style="font-size:12px;color:var(--color-outline);padding:8px 0;">No tasks</div>`;
    return;
  }

  el.innerHTML = tasks.map(t => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--color-surface-container-low);border-radius:10px;">
      <span class="material-symbols-outlined" style="font-size:16px;color:${t.done ? 'var(--color-secondary)' : 'var(--color-outline)'};">
        ${t.done ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <span style="font-size:12px;font-weight:600;color:${t.done ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)'};${t.done ? 'text-decoration:line-through;' : ''}">${t.title}</span>
    </div>
  `).join('');
}

function renderAchGoals(containerId, goals) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (goals.length === 0) {
    el.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">flag</span><p>No goals tracked yet</p></div>`;
    return;
  }

  el.innerHTML = goals.map(g => {
    const pct = Math.min(Math.round((g.currentValue / g.target) * 100), 100);
    return `<div class="card" style="border-radius:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <span class="material-symbols-outlined" style="font-size:18px;color:${g.done ? 'var(--color-secondary)' : 'var(--color-primary)'};font-variation-settings:'FILL' 1;">${g.done ? 'check_circle' : 'flag'}</span>
        <div style="flex:1;font-size:13px;font-weight:700;">${g.title}</div>
        <span class="badge ${g.done ? 'badge-success' : 'badge-primary'}">${g.done ? 'Completed' : pct + '%'}</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${pct}%;background:${g.done ? 'var(--color-secondary)' : 'var(--color-primary)'}"></div>
      </div>
      <div style="font-size:11px;color:var(--color-on-surface-variant);margin-top:6px;">${g.currentValue} / ${g.target} ${g.unit}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════
   RENDER: CREDITS PAGE
═══════════════════════════════════ */
function renderCreditsPage() {
  const data = store.get();
  const credits = data.credits || [];

  // Summary stats
  const lentAll = credits.filter(c => c.type === 'lent');
  const borrowedAll = credits.filter(c => c.type === 'borrowed');
  const lentTotal = lentAll.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const borrowedTotal = borrowedAll.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const outstandingLent = lentAll.filter(c => !c.repaid).reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const outstandingBorrowed = borrowedAll.filter(c => !c.repaid).reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('credit-lent-total', fmtCurrency(lentTotal));
  setEl('credit-borrowed-total', fmtCurrency(borrowedTotal));
  setEl('credit-outstanding-lent', fmtCurrency(outstandingLent));
  setEl('credit-outstanding-borrowed', fmtCurrency(outstandingBorrowed));

  // Filter
  let visible = credits;
  if (activeCreditFilter === 'lent') visible = credits.filter(c => c.type === 'lent');
  else if (activeCreditFilter === 'borrowed') visible = credits.filter(c => c.type === 'borrowed');
  else if (activeCreditFilter === 'pending') visible = credits.filter(c => !c.repaid);

  const el = document.getElementById('credits-list');
  if (!el) return;

  if (visible.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <span class="material-symbols-outlined">handshake</span>
      <strong>No records found</strong>
      <p>Add a credit or debt record to get started.</p>
    </div>`;
    return;
  }

  el.innerHTML = visible.map(c => {
    const isLent = c.type === 'lent';
    const accentColor = isLent ? 'var(--color-secondary)' : 'var(--color-tertiary)';
    const bgColor = isLent ? 'rgba(71,226,102,0.06)' : 'rgba(255,84,71,0.06)';
    const borderColor = isLent ? 'rgba(71,226,102,0.12)' : 'rgba(255,84,71,0.12)';
    const iconBg = isLent ? 'rgba(71,226,102,0.1)' : 'rgba(255,84,71,0.1)';
    const icon = isLent ? 'arrow_upward' : 'arrow_downward';
    const label = isLent ? 'Lent' : 'Borrowed';
    const repaidColor = c.repaid ? 'var(--color-secondary)' : 'var(--color-outline)';
    const repaidBg = c.repaid ? 'rgba(71,226,102,0.1)' : 'var(--color-surface-container-high)';
    const repaidLabel = c.repaid ? '✓ Settled' : 'Mark Settled';
    return `<div class="credit-item" style="background:${bgColor};border:1px solid ${borderColor};">
      <div class="credit-item-main">
        <div class="tx-icon" style="background:${iconBg};flex-shrink:0;">
          <span class="material-symbols-outlined" style="color:${accentColor};">${icon}</span>
        </div>
        <div class="tx-info" style="flex:1;min-width:0;">
          <div class="tx-name" style="font-weight:700;">${c.person}</div>
          <div class="tx-sub">${c.note || fmtDate(c.date)}</div>
        </div>
        <span class="badge" style="background:${borderColor};color:${accentColor};flex-shrink:0;">${label}</span>
        <div class="tx-amount" style="color:${accentColor};flex-shrink:0;">${isLent ? '+' : '-'}${fmtCurrency(c.amount)}</div>
      </div>
      <div class="credit-item-actions">
        <span style="font-size:11px;color:var(--color-outline);">${fmtDate(c.date)}</span>
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
          ${c.repaid ? `<span class="badge badge-success" style="font-size:10px;">✓ Settled</span>` : ''}
          <button class="credit-action-btn" onclick="toggleCredit('${c.id}')" style="background:${repaidBg};color:${repaidColor};">${repaidLabel}</button>
          <button class="credit-delete-btn" onclick="deleteCredit('${c.id}')" title="Delete">
            <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}


/* ═══════════════════════════════════
   MASTER RENDER
═══════════════════════════════════ */
function renderAll() {
  switch (activePage) {
    case 'finance': renderFinancePage(); break;
    case 'analytics': renderAnalyticsPage(); break;
    case 'goals': renderGoalsPage(); break;
    case 'tasks': renderTasksPage(); break;
    case 'achievements': renderAchievementsPage(); break;
    case 'credits': renderCreditsPage(); break;
    case 'entry':       /* static form page */     break;
  }
}

/* ═══════════════════════════════════
   INIT
═══════════════════════════════════ */
async function init() {
  // Subscribe to store changes to automatically re-render
  store.subscribe(() => {
    console.log('Store updated from server, re-rendering...');
    renderAll();
  });

  // Load initial data from server
  await store.reload();

  // Set today as default date in forms (local date, not UTC)
  const today = localDateStr(new Date());
  ['income-date', 'expense-date', 'modal-credit-date', 'credit-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });

  // Default the entry type selection
  selectEntryType('income');
}

init();
