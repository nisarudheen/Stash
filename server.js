/**
 * THE OBSIDIAN LEDGER - Backend Server
 * Express.js + MongoDB (Mongoose)
 */

import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'obsidian_ledger_secret_key';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/obsidian_ledger';

/* ─── Mongoose Schemas ─── */

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    occupation: { type: String, default: '' }
}, { timestamps: true });

const incomeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, default: 'Other' },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    note: { type: String, default: '' }
}, { timestamps: true });

const expenseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, default: 'Other' },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    note: { type: String, default: '' }
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    period: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    note: { type: String, default: '' },
    done: { type: Boolean, default: false },
    date: { type: String, required: true },
    weekLabel: { type: String, default: '' },
    monthLabel: { type: String, default: '' }
}, { timestamps: true });

const goalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    target: { type: Number, required: true },
    currentValue: { type: Number, default: 0 },
    targetDate: { type: String, default: null },
    unit: { type: String, default: '%' },
    done: { type: Boolean, default: false }
}, { timestamps: true });

const creditSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    person: { type: String, required: true },
    amount: { type: Number, required: true },
    note: { type: String, default: '' },
    date: { type: String, required: true },
    type: { type: String, enum: ['lent', 'borrowed'], default: 'lent' },
    repaid: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Income = mongoose.model('Income', incomeSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Task = mongoose.model('Task', taskSchema);
const Goal = mongoose.model('Goal', goalSchema);
const Credit = mongoose.model('Credit', creditSchema);

/* ─── Task Helpers ─── */
function getWeekLabel(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    const sunday = new Date(d.setDate(diff));
    return 'Week of ' + sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthLabel(date) {
    return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getNextDate(dateStr, period) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    let next = new Date(y, mo - 1, d, 12, 0, 0);
    if (period === 'daily') next.setDate(next.getDate() + 1);
    else if (period === 'weekly') next.setDate(next.getDate() + 7);
    else if (period === 'monthly') next.setMonth(next.getMonth() + 1);
    return next;
}

/* ─── Middleware ─── */
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200   // legacy browser compat
};

app.use(cors(corsOptions));

// Explicitly handle ALL OPTIONS preflight requests immediately
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.static('.'));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
    next();
});

/* ─── Health Check ─── */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

/* ─── Auth Middleware ─── */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

/* ─── AUTH ROUTES ─── */

// Register
app.post('/api/auth/register', async (req, res) => {
    const { firstName, lastName, email, password, currency, occupation } = req.body;
    try {
        const exists = await User.findOne({ email: email.toLowerCase() });
        if (exists) return res.status(400).json({ error: 'User already exists' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ firstName, lastName, email, passwordHash, currency, occupation });

        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({
            token,
            user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, currency: user.currency, occupation: user.occupation }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id }, JWT_SECRET);
        res.json({
            token,
            user: { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, currency: user.currency, occupation: user.occupation }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── DATA ROUTES ─── */

// Get all user data
app.get('/api/data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [income, expenses, tasks, goals, credits] = await Promise.all([
            Income.find({ userId }).sort({ date: -1 }).lean(),
            Expense.find({ userId }).sort({ date: -1 }).lean(),
            Task.find({ userId }).sort({ createdAt: 1 }).lean(),
            Goal.find({ userId }).sort({ createdAt: 1 }).lean(),
            Credit.find({ userId }).sort({ date: -1 }).lean()
        ]);

        const mapDoc = doc => ({ ...doc, id: doc._id.toString() });

        res.json({
            income: income.map(mapDoc),
            expenses: expenses.map(mapDoc),
            tasks: tasks.map(mapDoc),
            goals: goals.map(mapDoc),
            credits: credits.map(mapDoc)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── INCOME ─── */
app.post('/api/income', authenticateToken, async (req, res) => {
    const { type, amount, date, note } = req.body;
    try {
        const doc = await Income.create({ userId: req.user.id, type, amount, date, note });
        res.json({ ...doc.toObject(), id: doc._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/income/:id', authenticateToken, async (req, res) => {
    try {
        await Income.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── EXPENSES ─── */
app.post('/api/expenses', authenticateToken, async (req, res) => {
    const { type, amount, date, note } = req.body;
    try {
        const doc = await Expense.create({ userId: req.user.id, type, amount, date, note });
        res.json({ ...doc.toObject(), id: doc._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        await Expense.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── TASKS ─── */
app.post('/api/tasks', authenticateToken, async (req, res) => {
    const { title, period, note, date, weekLabel, monthLabel } = req.body;
    try {
        const doc = await Task.create({ userId: req.user.id, title, period, note, date, weekLabel, monthLabel });
        res.json({ ...doc.toObject(), id: doc._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/tasks/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'Not found' });
        task.done = !task.done;
        await task.save();
        res.json({ ...task.toObject(), id: task._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/tasks/:id/rollover', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, userId: req.user.id });
        if (!task) return res.status(404).json({ error: 'Not found' });
        const nextDate = getNextDate(task.date, task.period);
        const nextDateStr = nextDate.toISOString().slice(0, 10);
        task.date = nextDateStr;
        task.done = false;
        task.weekLabel = getWeekLabel(nextDate);
        task.monthLabel = getMonthLabel(nextDate);
        await task.save();
        res.json({ ...task.toObject(), id: task._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks/rollover-all', authenticateToken, async (req, res) => {
    try {
        const { period } = req.body;
        const tasks = await Task.find({ userId: req.user.id, period });
        for (const task of tasks) {
            const nextDate = getNextDate(task.date, task.period);
            const nextDateStr = nextDate.toISOString().slice(0, 10);
            task.date = nextDateStr;
            task.done = false;
            task.weekLabel = getWeekLabel(nextDate);
            task.monthLabel = getMonthLabel(nextDate);
            await task.save();
        }
        res.json({ success: true, count: tasks.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        await Task.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── GOALS ─── */
app.post('/api/goals', authenticateToken, async (req, res) => {
    const { title, target, targetDate, unit, currentValue } = req.body;
    try {
        const doc = await Goal.create({ userId: req.user.id, title, target, targetDate: targetDate || null, unit, currentValue: currentValue || 0 });
        res.json({ ...doc.toObject(), id: doc._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/goals/:id/progress', authenticateToken, async (req, res) => {
    const { currentValue } = req.body;
    try {
        const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id });
        if (!goal) return res.status(404).json({ error: 'Not found' });
        goal.currentValue = parseFloat(currentValue);
        goal.done = goal.currentValue >= goal.target;
        await goal.save();
        res.json({ ...goal.toObject(), id: goal._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/goals/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const goal = await Goal.findOne({ _id: req.params.id, userId: req.user.id });
        if (!goal) return res.status(404).json({ error: 'Not found' });
        goal.done = !goal.done;
        await goal.save();
        res.json({ ...goal.toObject(), id: goal._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
    try {
        await Goal.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── CREDITS ─── */
app.post('/api/credits', authenticateToken, async (req, res) => {
    const { person, amount, note, date, type } = req.body;
    try {
        const doc = await Credit.create({ userId: req.user.id, person, amount, note, date, type: type || 'lent' });
        res.json({ ...doc.toObject(), id: doc._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/credits/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const credit = await Credit.findOne({ _id: req.params.id, userId: req.user.id });
        if (!credit) return res.status(404).json({ error: 'Not found' });
        credit.repaid = !credit.repaid;
        await credit.save();
        res.json({ ...credit.toObject(), id: credit._id.toString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/credits/:id', authenticateToken, async (req, res) => {
    try {
        await Credit.deleteOne({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── START ─── */
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
        app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error('❌ MongoDB connection failed:', err);
        process.exit(1);
    });
