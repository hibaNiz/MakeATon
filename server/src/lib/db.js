// Database connection pool (plain PostgreSQL via the "pg" driver).
import pg from 'pg';
import 'dotenv/config';

// NUMERIC columns come back as strings by default -> turn them into numbers.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// DATE columns: keep as plain 'YYYY-MM-DD' strings so time zones never shift the day.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

// Run one query.  Usage: const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
export const query = (text, params) => pool.query(text, params);

// Run several queries in one transaction: everything succeeds or nothing is saved.
// Usage: await transaction(async (client) => { await client.query(...); ... });
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Next human-friendly number, e.g. nextNumber(client, 'SUB') -> 'SUB-00001'
export async function nextNumber(client, prefix) {
  const { rows } = await client.query(
    `INSERT INTO sequences (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = sequences.value + 1
     RETURNING value`,
    [prefix]
  );
  return `${prefix}-${String(rows[0].value).padStart(5, '0')}`;
}
