import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    user: 'nizar',
    host: 'localhost',
    database: 'obsidian_ledger',
    port: 5432,
});

async function createAdmin() {
    const firstName = 'Admin';
    const lastName = 'User';
    const email = 'admin@example.com';
    const password = 'adminpassword123';
    const currency = 'USD';
    const occupation = 'Administrator';

    try {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, password_hash, currency, occupation) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING RETURNING id',
            [firstName, lastName, email, passwordHash, currency, occupation]
        );

        if (result.rows.length > 0) {
            console.log('Admin user created successfully');
            console.log('Email:', email);
            console.log('Password:', password);
        } else {
            console.log('Admin user already exists or could not be created');
        }
    } catch (err) {
        console.error('Error creating admin user:', err);
    } finally {
        await pool.end();
    }
}

createAdmin();
