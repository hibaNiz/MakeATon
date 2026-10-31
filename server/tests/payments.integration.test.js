import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Payments HTTP API with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'payments_test_' + randomUUID().replaceAll('-', '');
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
  const { today, addDays } = await import('../src/lib/dates.js');
  const { runBilling } = await import('../src/modules/billing/billing.service.js');
  const app = await createApp();
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = {}, users = {};
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER']) {
    const { rows: [user] } = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *',
      [role, role.toLowerCase() + '@example.com', 'unused-test-hash', role]);
    tokens[role] = signToken(user); users[role] = user;
  }
  async function request(path, { role = 'STAFF', method = 'GET', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(role ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = res.status === 204 ? null : await res.json();
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const plan = await request('/plans', { method: 'POST', status: 201, body: { name: 'Monthly', price: 99, billing_period: 'MONTHLY',
    min_quantity: 1, auto_close: true, closable: true, pausable: true, renewable: true } });
  const tax = await request('/taxes', { method: 'POST', status: 201, body: { name: 'GST', rate: 18 } });
  const product = await request('/products', { method: 'POST', status: 201, body: { name: 'CRM', type: 'SOFTWARE', sales_price: 1200,
    cost_price: 100, tax_id: tax.id, variants: [{ attribute: 'Brand', value: 'Odoo', extra_price: 560 }] } });
  const lines = [{ product_id: product.id, variant_id: product.variants[0].id, quantity: 2 }];
  const currentDate = today();
  const action = (id, name, extra = {}, status = 200) => request(`/subscriptions/${id}/actions`, { method: 'POST', body: { action: name, ...extra }, status });
  async function activeSubscription(patch = {}) {
    const draft = await request('/subscriptions', { method: 'POST', status: 201, body: { customer_id: users.CUSTOMER.id, plan_id: plan.id,
      start_date: currentDate, expiry_date: addDays(currentDate, 365), lines, ...patch } });
    await action(draft.id, 'quote', patch.expiry_date ? { quotation_valid_until: patch.expiry_date } : {});
    for (const name of ['confirm', 'activate']) await action(draft.id, name);
    return draft;
  }

  await t.test('only staff can reach payments, and input is checked', async () => {
    await request('/payments', { role: null, status: 401 });
    await request('/payments', { role: 'CUSTOMER', status: 403 });
    await request('/payments?pageSize=101', { status: 400 });
    await request('/payments?from=2026-12-01&to=2026-01-01', { status: 400 });
    await request('/payments', { method: 'POST', body: { invoice_id: 2147483647, method: 'UPI', amount: 5, date: currentDate }, status: 404 });
  });
  const sub = await activeSubscription();
  const invoice = await request('/invoices', { method: 'POST', body: { subscription_id: sub.id }, status: 201 });
  await t.test('draft invoices cannot be paid; confirming opens them for payment', async () => {
    const pay = { invoice_id: invoice.id, method: 'UPI', amount: 100, date: currentDate };
    await request('/payments', { method: 'POST', body: pay, status: 409 });
    await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'confirm' } });
  });
  await t.test('payments are validated against the balance and dates', async () => {
    const pay = { invoice_id: invoice.id, method: 'UPI', amount: 100, date: currentDate };
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 1.234 }, { amount: 'x' }, { method: 'GOLD' }, { date: addDays(currentDate, 1) }, { date: addDays(currentDate, -3) }, { amount: 99999 }])
      await request('/payments', { method: 'POST', body: { ...pay, ...bad }, status: 400 });
    await request('/payments', { method: 'POST', body: { ...pay, extra: 1 }, status: 400 });
  });
  await t.test('partial then full payment settles the invoice; balances stay exact', async () => {
    const pay = { invoice_id: invoice.id, method: 'BANK_TRANSFER', date: currentDate };
    const first = await request('/payments', { method: 'POST', status: 201, body: { ...pay, amount: 1000.1 } });
    assert.equal(first.recorded_by_id, users.STAFF.id);
    let current = await request('/invoices/' + invoice.id);
    assert.equal(current.status, 'CONFIRMED');
    assert.equal(current.balance, 3252.5);
    await request('/payments', { method: 'POST', body: { ...pay, amount: 3252.51 }, status: 400 });
    await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'cancel' }, status: 409 });
    await request('/payments', { method: 'POST', status: 201, body: { ...pay, amount: 3252.5, method: 'CASH' } });
    current = await request('/invoices/' + invoice.id);
    assert.equal(current.status, 'PAID');
    assert.equal(current.balance, 0);
    assert.equal(current.payments.length, 2);
    await request('/payments', { method: 'POST', body: { ...pay, amount: 1 }, status: 409 });
  });
  await t.test('two payments at once cannot overpay an invoice', async () => {
    const other = await activeSubscription();
    const inv = await request('/invoices', { method: 'POST', body: { subscription_id: other.id }, status: 201 });
    await request(`/invoices/${inv.id}/actions`, { method: 'POST', body: { action: 'confirm' } });
    const send = () => fetch(base + '/payments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.STAFF },
      body: JSON.stringify({ invoice_id: inv.id, method: 'CARD', amount: 3000, date: currentDate }) });
    const statuses = (await Promise.all([send(), send()])).map(r => r.status).sort();
    assert.deepEqual(statuses, [201, 400]);
    const after = await request('/invoices/' + inv.id);
    assert.equal(after.amount_paid, 3000);
  });
  await t.test('only an admin can delete a payment, and the invoice reopens', async () => {
    const [payment] = (await request('/invoices/' + invoice.id)).payments;
    await request('/payments/' + payment.id, { method: 'DELETE', status: 403 });
    await request('/payments/' + payment.id, { role: 'ADMIN', method: 'DELETE', status: 204 });
    const after = await request('/invoices/' + invoice.id);
    assert.equal(after.status, 'CONFIRMED');
    assert.equal(Math.round(after.balance * 100), 100010);
    await request('/payments/' + payment.id, { role: 'ADMIN', method: 'DELETE', status: 404 });
  });
  await t.test('search, method and date filters work', async () => {
    assert.ok((await request('/payments?method=CASH&from=' + currentDate)).total >= 0);
    assert.equal((await request('/payments?search=%25')).total, 0);
    assert.equal((await request('/payments?pageSize=1')).items.length <= 1, true);
  });
});
