/**
 * THE OBSIDIAN LEDGER - Backend Server
 * Express.js + PostgreSQL
 */

import express from 'express';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'obsidian_ledger_secret_key';

/* ─── Task Helpers ─── */
function getWeekLabel(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Back to Sunday
    const sunday = new Date(d.setDate(diff));
    return 'Week of ' + sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMonthLabel(date) {
    return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getNextDate(date, period) {
    const dateStr = date instanceof Date ? date.toLocaleDateString('en-CA') : date.slice(0, 10);
    const [y, mo, d] = dateStr.split('-').map(Number);
    let nextDate = new Date(y, mo - 1, d, 12, 0, 0); // Noon local

    if (period === 'daily') {
        nextDate.setDate(nextDate.getDate() + 1);
    } else if (period === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
    } else if (period === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
    }
    return nextDate;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url}`);
    if (req.method === 'POST' || req.method === 'PATCH') {
        const safeBody = { ...req.body };
        if (safeBody.password) safeBody.password = '***';
        console.log('Body:', safeBody);
    }
    next();
});

// PostgreSQL Pool
const pool = new pg.Pool({
    user: 'nizar',
    host: 'localhost',
    database: 'obsidian_ledger',
    port: 5432,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Auth Middleware
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
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password_hash, currency, occupation) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, first_name, last_name, email, currency, occupation',
            [firstName, lastName, email, passwordHash, currency, occupation]
        );

        const raw = result.rows[0];
        const token = jwt.sign({ id: raw.id }, JWT_SECRET);

        res.json({
            token,
            user: {
                id: raw.id,
                firstName: raw.first_name,
                lastName: raw.last_name,
                email: raw.email,
                currency: raw.currency,
                occupation: raw.occupation
            }
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
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id }, JWT_SECRET);
        res.json({
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email,
                currency: user.currency,
                occupation: user.occupation
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/* ─── DATA ROUTES ─── */

// Get All User Data
app.get('/api/data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const income = await pool.query('SELECT id, type, amount, date, note FROM income WHERE user_id = $1 ORDER BY date DESC', [userId]);
        const expenses = await pool.query('SELECT id, type, amount, date, note FROM expenses WHERE user_id = $1 ORDER BY date DESC', [userId]);
        const tasks = await pool.query('SELECT id, title, period, note, done, date, week_label AS "weekLabel", month_label AS "monthLabel" FROM tasks WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
        const goals = await pool.query('SELECT id, title, target, current_value AS "currentValue", target_date AS "targetDate", unit, done FROM goals WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
        const credits = await pool.query('SELECT id, person, amount, note, date, type, repaid FROM credits WHERE user_id = $1 ORDER BY date DESC', [userId]);

        res.json({
            income: income.rows,
            expenses: expenses.rows,
            tasks: tasks.rows,
            goals: goals.rows,
            credits: credits.rows
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
        const result = await pool.query(
            'INSERT INTO income (user_id, type, amount, date, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, type, amount, date, note]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/income/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM income WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── EXPENSES ─── */
app.post('/api/expenses', authenticateToken, async (req, res) => {
    const { type, amount, date, note } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO expenses (user_id, type, amount, date, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [req.user.id, type, amount, date, note]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── TASKS ─── */
app.post('/api/tasks', authenticateToken, async (req, res) => {
    const { title, period, note, date, weekLabel, monthLabel } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tasks (user_id, title, period, note, date, week_label, month_label) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [req.user.id, title, period, note, date, weekLabel, monthLabel]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/tasks/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE tasks SET done = NOT done WHERE id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/tasks/:id/rollover', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;
        const userId = req.user.id;

        const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
        const task = taskResult.rows[0];

        if (!task) return res.status(404).json({ error: 'Task not found' });

        const nextDate = getNextDate(task.date, task.period);
        const nextDateStr = nextDate.toISOString().slice(0, 10);
        const weekLabel = getWeekLabel(nextDate);
        const monthLabel = getMonthLabel(nextDate);

        const result = await pool.query(
            'UPDATE tasks SET date = $1, done = FALSE, week_label = $2, month_label = $3 WHERE id = $4 AND user_id = $5 RETURNING *',
            [nextDateStr, weekLabel, monthLabel, taskId, userId]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tasks/rollover-all', authenticateToken, async (req, res) => {
    try {
        const { period } = req.body;
        const userId = req.user.id;

        const taskResult = await pool.query('SELECT * FROM tasks WHERE user_id = $1 AND period = $2', [userId, period]);

        for (const task of taskResult.rows) {
            const nextDate = getNextDate(task.date, task.period);
            const nextDateStr = nextDate.toISOString().slice(0, 10);
            const weekLabel = getWeekLabel(nextDate);
            const monthLabel = getMonthLabel(nextDate);

            await pool.query(
                'UPDATE tasks SET date = $1, done = FALSE, week_label = $2, month_label = $3 WHERE id = $4',
                [nextDateStr, weekLabel, monthLabel, task.id]
            );
        }

        res.json({ success: true, count: taskResult.rowCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── GOALS ─── */
app.post('/api/goals', authenticateToken, async (req, res) => {
    const { title, target, targetDate, unit, currentValue } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO goals (user_id, title, target, target_date, unit, current_value) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.id, title, target, targetDate || null, unit, currentValue || 0]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/goals/:id/progress', authenticateToken, async (req, res) => {
    const { currentValue } = req.body;
    try {
        const result = await pool.query(
            'UPDATE goals SET current_value = $1, done = ($1 >= target) WHERE id = $2 AND user_id = $3 RETURNING *',
            [currentValue, req.params.id, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/goals/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE goals SET done = NOT done WHERE id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/goals/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM goals WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── CREDITS ─── */
app.post('/api/credits', authenticateToken, async (req, res) => {
    const { person, amount, note, date, type } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO credits (user_id, person, amount, note, date, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [req.user.id, person, amount, note, date, type || 'lent']
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/credits/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE credits SET repaid = NOT repaid WHERE id = $1 AND user_id = $2 RETURNING *',
            [req.params.id, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/credits/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM credits WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
