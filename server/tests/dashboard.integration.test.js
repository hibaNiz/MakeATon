import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Finance dashboard with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'dashboard_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', '-csearch_path=' + schema);
  process.env.DATABASE_URL = url.href;
  process.env.JWT_SECRET = randomUUID();
  const { pool } = await import('../src/lib/db.js');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  });
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const { createApp } = await import('../src/app.js');
  const { signToken } = await import('../src/lib/auth.js');
  const { today, addDays, addPeriod } = await import('../src/lib/dates.js');
  const asOf = today(), month = asOf.slice(0, 7) + '-01';
  const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
  const users = {}, tokens = {};
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER']) {
    users[role] = await one('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *',
      [role, role + '@example.com', 'unused', role]);
    tokens[role] = signToken(users[role]);
  }
  const app = await createApp();
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path = '/dashboard', { role = 'STAFF', method = 'GET', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(role ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = res.status === 204 ? null : await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    return data;
  }
  async function subscription({ price = 100, period = 'MONTHLY', status = 'DRAFT', start = month, expiry = null } = {}) {
    const plan = await one('INSERT INTO plans (name,price,billing_period) VALUES ($1,$2,$3) RETURNING id', ['Plan', price, period]);
    return one('INSERT INTO subscriptions (number,customer_id,plan_id,status,start_date,expiry_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [randomUUID(), users.CUSTOMER.id, plan.id, status, start, expiry]);
  }
  async function invoice({ total = 100, paid = 0, status = 'CONFIRMED', date = month, due = asOf } = {}) {
    const sub = await subscription();
    return one(`INSERT INTO invoices (number,subscription_id,customer_id,status,invoice_date,due_date,period_start,period_end,subtotal,total,amount_paid)
      VALUES ($1,$2,$3,$4,$5,$6,$5,$5,$7,$7,$8) RETURNING *`,
    [randomUUID(), sub.id, users.CUSTOMER.id, status, date, due, total, paid]);
  }
  async function receipt(inv, amount, date = asOf, method = 'UPI') {
    return one('INSERT INTO payments (invoice_id,amount,date,method) VALUES ($1,$2,$3,$4) RETURNING *', [inv.id, amount, date, method]);
  }
  async function check(name, fn) {
    await t.test(name, async () => {
      await pool.query('TRUNCATE payments, invoices, subscriptions, plans, products, discounts CASCADE');
      await fn();
    });
  }

  await check('empty dashboard is zero-filled and restricted to internal roles', async () => {
    await request('/dashboard', { role: null, status: 401 });
    await request('/dashboard', { role: 'CUSTOMER', status: 403 });
    for (const role of ['ADMIN', 'STAFF']) {
      const data = await request('/dashboard', { role });
      assert.ok(Object.values(data.summary).every(value => value === 0));
      assert.equal(data.trend.length, 6);
      assert.ok(data.trend.every(row => row.billed === 0 && row.collected === 0));
      assert.equal(data.aging.length, 5);
      assert.deepEqual(data.payment_methods, []);
      assert.deepEqual(data.overdue_invoices, []);
      assert.equal(data.as_of, asOf);
    }
  });
  await check('only supported month filters are accepted', async () => {
    for (const query of ['months=0', 'months=4', 'months=13', 'months=', 'months=3.0', 'months=3&months=6', 'months[]=3', 'unknown=x'])
      await request('/dashboard?' + query, { status: 400 });
    for (const months of [3, 6, 12]) {
      const data = await request('/dashboard?months=' + months);
      assert.equal(data.trend.length, months);
      assert.equal(data.period.from, addPeriod(month, 'MONTHLY', 1 - months));
      assert.equal(data.trend.at(-1).month, month);
    }
  });
  await check('billed and collected use their own dates without duplicating invoice totals', async () => {
    const old = await invoice({ date: addPeriod(month, 'MONTHLY', -8), total: 200, paid: 120.3 });
    await receipt(old, 100.1, asOf, 'BANK_TRANSFER');
    await receipt(old, 20.2, asOf, 'UPI');
    const settled = await invoice({ date: month, total: 80.75, paid: 80.75, status: 'PAID' });
    await receipt(settled, 80.75);
    await invoice({ total: 999, status: 'DRAFT' });
    await invoice({ total: 999, status: 'CANCELLED' });
    await invoice({ total: 999, date: addDays(asOf, 1) });
    const data = await request();
    assert.equal(data.summary.billed, 80.75);
    assert.equal(data.summary.collected, 201.05);
    assert.equal(data.summary.payment_count, 3);
    assert.equal(data.summary.outstanding, 79.7);
    assert.equal(data.summary.outstanding_count, 1);
    assert.equal(data.trend.at(-1).billed, 80.75);
    assert.equal(data.trend.at(-1).collected, 201.05);
    assert.deepEqual(data.payment_methods, [{ method: 'UPI', amount: 100.95, count: 2 }, { method: 'BANK_TRANSFER', amount: 100.1, count: 1 }]);
  });
  await check('month and year boundaries include the first day and exclude outside dates', async () => {
    const from = addPeriod(month, 'MONTHLY', -11);
    const inv = await invoice({ date: from, total: 70, paid: 70, status: 'PAID' });
    await receipt(inv, 70, from, 'CASH');
    const before = await invoice({ date: addDays(from, -1), total: 50, paid: 50, status: 'PAID' });
    await receipt(before, 50, addDays(from, -1));
    const future = await invoice({ date: addDays(asOf, 1), total: 99, paid: 99, status: 'PAID' });
    await receipt(future, 99, addDays(asOf, 1));
    const data = await request('/dashboard?months=12');
    assert.equal(data.summary.billed, 70);
    assert.equal(data.summary.collected, 70);
    assert.deepEqual(data.trend[0], { month: from, billed: 70, collected: 70 });
    for (let i = 1; i < 12; i++) assert.deepEqual(data.trend[i], { month: addPeriod(from, 'MONTHLY', i), billed: 0, collected: 0 });
    assert.equal((await request('/dashboard?months=3')).summary.collected, 0);
  });
  await check('aging boundaries, partial balances and oldest eight invoices are exact', async () => {
    for (const days of [-1, 0, 1, 30, 31, 60, 61, 90, 91, 150])
      await invoice({ total: 100.5, paid: 20.25, date: addDays(asOf, -200), due: addDays(asOf, -days) });
    await invoice({ status: 'CANCELLED', due: addDays(asOf, -300) });
    const data = await request();
    assert.equal(data.summary.outstanding, 802.5);
    assert.equal(data.summary.overdue, 642);
    assert.equal(data.summary.overdue_count, 8);
    assert.deepEqual(data.aging.map(b => [b.count, b.amount]), Array(5).fill([2, 160.5]));
    assert.deepEqual(data.overdue_invoices.map(i => i.days_overdue), [150, 91, 90, 61, 60, 31, 30, 1]);
    await invoice({ date: addDays(asOf, -201), due: addDays(asOf, -201) });
    const limited = await request();
    assert.equal(limited.summary.overdue_count, 9);
    assert.equal(limited.overdue_invoices.length, 8);
    assert.equal(limited.overdue_invoices[0].days_overdue, 201);
  });
  await check('MRR normalizes active recurring fees and saved product quantities before discounts and tax', async () => {
    const sub = await subscription({ status: 'ACTIVE', price: 100, expiry: asOf });
    const product = await one("INSERT INTO products (name,sales_price,cost_price) VALUES ('Product',999,0) RETURNING id");
    await pool.query('INSERT INTO subscription_lines (subscription_id,product_id,quantity,unit_price) VALUES ($1,$2,2,25.5),($1,$2,3,10)', [sub.id, product.id]);
    await subscription({ status: 'ACTIVE', period: 'YEARLY', price: 1200 });
    await subscription({ status: 'ACTIVE', period: 'WEEKLY', price: 12 });
    await subscription({ status: 'ACTIVE', period: 'DAILY', price: 1 });
    for (const status of ['DRAFT', 'QUOTATION', 'CONFIRMED', 'PAUSED', 'CLOSED']) await subscription({ status, price: 999 });
    await subscription({ status: 'ACTIVE', start: addDays(asOf, 1), price: 999 });
    await subscription({ status: 'ACTIVE', expiry: addDays(asOf, -1), price: 999 });
    const discount = await one("INSERT INTO discounts (name,type,value,used_count) VALUES ('Discount','PERCENTAGE',10,2) RETURNING id");
    await pool.query('UPDATE subscriptions SET discount_id=$2 WHERE id=$1', [sub.id, discount.id]);
    const data = await request();
    assert.equal(data.summary.active_subscriptions, 4);
    assert.equal(data.summary.estimated_mrr, 363.42);
    assert.equal((await request('/dashboard?months=3')).summary.estimated_mrr, 363.42);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [discount.id])).used_count, 2);
    assert.equal((await one('SELECT count(*)::int AS count FROM invoices')).count, 0);
  });
  await check('recording and removing payments refreshes cash, balances and aging', async () => {
    const inv = await invoice({ total: 125.55, date: addDays(asOf, -2), due: addDays(asOf, -1) });
    const pay = await request('/payments', { method: 'POST', status: 201,
      body: { invoice_id: inv.id, amount: 125.55, date: asOf, method: 'CHEQUE' } });
    let data = await request();
    assert.equal(data.summary.collected, 125.55);
    assert.equal(data.summary.outstanding, 0);
    assert.equal(data.summary.overdue_count, 0);
    await request('/payments/' + pay.id, { method: 'DELETE', role: 'ADMIN', status: 204 });
    data = await request();
    assert.equal(data.summary.collected, 0);
    assert.equal(data.summary.outstanding, 125.55);
    assert.equal(data.summary.overdue, 125.55);
    assert.equal(data.overdue_invoices[0].id, inv.id);
  });
});
