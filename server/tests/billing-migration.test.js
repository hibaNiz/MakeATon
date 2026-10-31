import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('billing migration preserves existing invoices and runs once across concurrent starts', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test',
}, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'billing_migration_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', '-csearch_path=' + schema);
  process.env.DATABASE_URL = url.href;
  const { pool } = await import('../src/lib/db.js');
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  await pool.query(`INSERT INTO users (name,email,password_hash) VALUES ('Customer','migration@example.com','unused');
    INSERT INTO plans (name,price) VALUES ('Monthly',100);
    INSERT INTO subscriptions (number,customer_id,plan_id,start_date) VALUES ('SUB-1',1,1,'2026-01-01');
    INSERT INTO invoices (number,subscription_id,customer_id,invoice_date,due_date,period_start,period_end,subtotal,total)
      VALUES ('INV-1',1,1,'2026-01-01','2026-01-16','2026-01-01','2026-01-31',100,100);
    ALTER TABLE invoices DROP COLUMN period_days, DROP COLUMN billable_days;`);
  const { migrate } = await import('../db/migrate.js');
  const results = await Promise.all([migrate(), migrate()]);
  assert.equal(results.flat().length, 1);
  assert.deepEqual(await migrate(), []);
  const { rows: [invoice] } = await pool.query('SELECT * FROM invoices');
  assert.equal(invoice.number, 'INV-1');
  assert.equal(invoice.total, 100);
  assert.equal(invoice.billable_days, 1);
  assert.equal(invoice.period_days, 1);
  await assert.rejects(pool.query('UPDATE invoices SET billable_days=0'), { code: '23514' });
  await assert.rejects(pool.query('UPDATE invoices SET billable_days=2,period_days=1'), { code: '23514' });
  await pool.query('UPDATE invoices SET billable_days=10,period_days=31');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM subscriptions')).rows[0].n, 1);
});
