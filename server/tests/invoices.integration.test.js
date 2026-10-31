import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import nodemailer from 'nodemailer';
import 'dotenv/config';

test('Invoices HTTP API with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  process.env.SMTP_HOST = 'smtp.test.invalid';
  const sentMessages = [];
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async message => { sentMessages.push(message); } }));
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'invoices_test_' + randomUUID().replaceAll('-', '');
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

  await t.test('only staff can reach billing, and input is checked', async () => {
    await request('/invoices', { role: null, status: 401 });
    await request('/invoices', { role: 'CUSTOMER', status: 403 });
    await request('/invoices', { status: 200 });
    await request('/invoices?pageSize=101', { status: 400 });
    await request('/invoices?status=BOGUS', { status: 400 });
    await request('/invoices/abc', { status: 400 });
    await request('/invoices/2147483647', { status: 404 });
    await request('/invoices', { method: 'POST', body: {}, status: 400 });
  });

  let sub, invoice;
  await t.test('the next invoice is created with correct amounts and the billing date moves on', async () => {
    sub = await activeSubscription();
    invoice = await request('/invoices', { method: 'POST', body: { subscription_id: sub.id }, status: 201 });
    assert.equal(invoice.status, 'DRAFT');
    assert.equal(invoice.period_start, currentDate);
    assert.equal(invoice.total, 4252.6);
    assert.equal(invoice.lines.length, 2);
    assert.match(invoice.number, /^INV/);
    const after = await request('/subscriptions/' + sub.id);
    assert.ok(after.next_billing_date > currentDate);
    await request('/invoices', { method: 'POST', body: { subscription_id: sub.id }, status: 409 }); // next period has not started
  });
  await t.test('the same period is never billed twice, even in parallel', async () => {
    const other = await activeSubscription();
    const results = await Promise.all([1, 2, 3, 4].map(() => fetch(base + '/invoices', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.STAFF }, body: JSON.stringify({ subscription_id: other.id }) })));
    const statuses = results.map(r => r.status).sort();
    assert.equal(statuses.filter(s => s === 201).length, 1, statuses.join());
    assert.equal((await request('/invoices?subscription_id=' + other.id)).total, 1);
    const { rows: [{ count }] } = await pool.query('SELECT count(*)::int FROM invoices WHERE subscription_id=$1 AND period_start=$2', [other.id, currentDate]);
    assert.equal(count, 1);
  });
  await t.test('drafts can be confirmed once', async () => {
    const confirmed = await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'confirm' } });
    assert.equal(confirmed.status, 'CONFIRMED');
    await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'confirm' }, status: 409 });
  });
  await t.test('overdue means confirmed, past due and unpaid', async () => {
    await pool.query('UPDATE invoices SET due_date=$2 WHERE id=$1', [invoice.id, addDays(currentDate, -1)]);
    const list = await request('/invoices?overdue=true');
    assert.ok(list.items.some(i => i.id === invoice.id && i.is_overdue));
    assert.ok((await request('/invoices?unpaid=true')).total >= 1);
  });
  await t.test('cancelling restores discount usage and blocks nothing else', async () => {
    const discount = await request('/discounts', { role: 'ADMIN', method: 'POST', status: 201, body: { name: 'Welcome', scope: 'SUBSCRIPTION',
      type: 'PERCENTAGE', value: 10, usage_limit: 5 } });
    const s = await activeSubscription({ discount_id: discount.id });
    const inv = await request('/invoices', { method: 'POST', body: { subscription_id: s.id }, status: 201 });
    assert.equal(inv.discount_total, 361.9);
    assert.equal((await request('/discounts/' + discount.id)).used_count, 1);
    const cancelled = await request(`/invoices/${inv.id}/actions`, { method: 'POST', body: { action: 'cancel' } });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal((await request('/discounts/' + discount.id)).used_count, 0);
    await request(`/invoices/${inv.id}/actions`, { method: 'POST', body: { action: 'cancel' }, status: 409 });
    await request(`/invoices/${inv.id}/actions`, { method: 'POST', body: { action: 'send' }, status: 409 });
  });
  await t.test('missing or failed email delivery never marks an invoice sent', async () => {
    delete process.env.SMTP_HOST;
    await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'send' }, status: 503 });
    assert.equal((await request('/invoices/' + invoice.id)).sent_at, null);
    process.env.SMTP_HOST = 'smtp.test.invalid';
    const failure = t.mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('Test delivery failure'); } }));
    await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'send' }, status: 500 });
    assert.equal((await request('/invoices/' + invoice.id)).sent_at, null);
    failure.mock.restore();
  });
  await t.test('sending an invoice records when it was sent', async () => {
    const sent = await request(`/invoices/${invoice.id}/actions`, { method: 'POST', body: { action: 'send' } });
    assert.ok(sent.sent_at);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].to, users.CUSTOMER.email);
  });
  await t.test('billing run catches up on missed periods and skips paused or draft subscriptions', async () => {
    const past = addDays(currentDate, -75);
    const behind = await activeSubscription({ start_date: past, expiry_date: addDays(currentDate, 365) });
    const draft = await request('/subscriptions', { method: 'POST', status: 201, body: { customer_id: users.CUSTOMER.id, plan_id: plan.id, start_date: past, lines } });
    const paused = await activeSubscription({ start_date: past });
    await action(paused.id, 'pause');
    const result = await request('/billing/run', { method: 'POST', body: { confirm: true } });
    assert.ok(result.created >= 3, JSON.stringify(result));
    const mine = await request('/invoices?subscription_id=' + behind.id);
    assert.equal(mine.total, 3);
    assert.ok(mine.items.every(i => i.status === 'CONFIRMED'));
    assert.equal((await request('/invoices?subscription_id=' + draft.id)).total, 0);
    assert.equal((await request('/invoices?subscription_id=' + paused.id)).total, 0);
    const again = await request('/billing/run', { method: 'POST', body: {} });
    assert.equal(again.created, 0);
    await runBilling({ confirm: true });
    assert.equal((await request('/invoices?subscription_id=' + behind.id)).total, 3);
    await request('/billing/run', { method: 'POST', body: { confirm: 'yes' }, status: 400 });
  });
  await t.test('a subscription cannot be billed beyond its expiry or when not active', async () => {
    const short = await activeSubscription({ expiry_date: currentDate });
    const partial = await request('/invoices', { method: 'POST', body: { subscription_id: short.id }, status: 201 });
    assert.equal(partial.billable_days, 1);
    assert.ok(partial.period_days >= 28);
    assert.ok(partial.total > 0 && partial.total < 4252.6);
    assert.equal(partial.period_end, currentDate);
    await request('/invoices', { method: 'POST', body: { subscription_id: short.id }, status: 409 });
    const draft = await request('/subscriptions', { method: 'POST', status: 201, body: { customer_id: users.CUSTOMER.id, plan_id: plan.id, start_date: currentDate, lines } });
    await request('/invoices', { method: 'POST', body: { subscription_id: draft.id }, status: 409 });
  });
  await t.test('search treats % and _ literally and filters work', async () => {
    assert.equal((await request('/invoices?search=%25')).total, 0);
    assert.ok((await request('/invoices?search=' + invoice.number)).total >= 1);
    await request('/invoices?from=2026-12-01&to=2026-01-01', { status: 400 });
  });
  await t.test('confirm-drafts settles zero-value invoices straight to paid', async () => {
    const free = await request('/discounts', { role: 'ADMIN', method: 'POST', status: 201, body: { name: 'Free', scope: 'SUBSCRIPTION', type: 'PERCENTAGE', value: 100 } });
    const s = await activeSubscription({ discount_id: free.id });
    const inv = await request('/invoices', { method: 'POST', body: { subscription_id: s.id }, status: 201 });
    assert.equal(inv.total, 0);
    await request('/invoices/confirm-drafts', { method: 'POST' });
    assert.equal((await request('/invoices/' + inv.id)).status, 'PAID');
    const automatic = await activeSubscription({ discount_id: free.id });
    const run = await request('/billing/run', { method: 'POST', body: { subscription_id: automatic.id } });
    assert.equal(run.created, 1);
    assert.equal((await request('/invoices/' + run.invoices[0].id)).status, 'PAID');
  });
});
