import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Customer portal with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'portal_test_' + randomUUID().replaceAll('-', '');
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
  const asOf = today(), expiry = addDays(asOf, 30);
  const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];
  const users = {}, tokens = {};
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER', 'OTHER']) {
    users[role] = await one('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *',
      [role, role + '@example.com', 'private-password-hash', role === 'OTHER' ? 'CUSTOMER' : role]);
    tokens[role] = signToken(users[role]);
  }
  const app = await createApp();
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, { role = 'CUSTOMER', method = 'GET', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json',
      ...(role ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = res.status === 204 ? null : await res.json();
    assert.equal(res.status, status, JSON.stringify(data));
    return data;
  }
  const staff = (path, body, status = 200) => request(path, { role: 'STAFF', method: 'POST', body, status });
  const act = (sub, action, rest = {}, status = 200) => request(`/portal/subscriptions/${sub.id}/actions`, { method: 'POST', body: { action, ...rest }, status });
  async function subscription({ owner = 'CUSTOMER', status = 'QUOTATION', validUntil = asOf, end = expiry, rules = true, name = 'Growth' } = {}) {
    const plan = await one('INSERT INTO plans (name,price,billing_period,pausable,closable,renewable) VALUES ($1,100,\'MONTHLY\',$2,$2,$2) RETURNING *', [name, rules]);
    const sub = await one(`INSERT INTO subscriptions (number,customer_id,plan_id,status,start_date,expiry_date,quotation_valid_until,next_billing_date,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$5,'Private staff note') RETURNING *`, [randomUUID(), users[owner].id, plan.id, status, asOf, end, validUntil]);
    const product = await one("INSERT INTO products (name,sales_price,cost_price) VALUES ('Workspace',50,10) RETURNING id");
    await pool.query('INSERT INTO subscription_lines (subscription_id,product_id,quantity,unit_price) VALUES ($1,$2,2,50)', [sub.id, product.id]);
    return sub;
  }
  async function invoice({ owner = 'CUSTOMER', status = 'CONFIRMED', date = asOf, due = addDays(asOf, -1), paid = 0 } = {}) {
    const sub = await subscription({ owner });
    return one(`INSERT INTO invoices (number,subscription_id,customer_id,status,invoice_date,due_date,period_start,period_end,subtotal,total,amount_paid)
      VALUES ($1,$2,$3,$4,$5,$6,$5,$5,100,100,$7) RETURNING *`, [randomUUID(), sub.id, users[owner].id, status, date, due, paid]);
  }
  async function check(name, fn) {
    await t.test(name, async () => {
      await pool.query('TRUNCATE payments, invoices, subscriptions, plans, products CASCADE');
      await fn();
    });
  }

  await check('portal is customer-only and returns empty summaries', async () => {
    for (const path of ['/portal/summary', '/portal/subscriptions', '/portal/invoices', '/portal/profile']) {
      await request(path, { role: null, status: 401 });
      for (const role of ['STAFF', 'ADMIN']) await request(path, { role, status: 403 });
    }
    assert.deepEqual(await request('/portal/summary'), { active: 0, quotations: 0, outstanding: 0, overdue: 0, as_of: asOf });
  });
  await check('ownership and draft visibility hold for reads and actions', async () => {
    const own = await subscription(), other = await subscription({ owner: 'OTHER' }), draft = await subscription({ status: 'DRAFT' });
    const listed = await request('/portal/subscriptions');
    assert.deepEqual(listed.items.map(s => s.id), [own.id]);
    for (const sub of [other, draft, { id: 2147483647 }]) {
      await request('/portal/subscriptions/' + sub.id, { status: 404 });
      await act(sub, 'accept', {}, 404);
    }
    const detail = await request('/portal/subscriptions/' + own.id);
    assert.equal(detail.lines.length, 1);
    assert.deepEqual(detail.available_actions, ['accept', 'close']);
    for (const key of ['customer_id', 'notes', 'created_by', 'customer_email', 'discount_id']) assert.equal(key in detail, false);
    assert.equal('cost_price' in detail.lines[0], false);
    await request('/subscriptions/' + own.id, { status: 403 });
  });
  await check('only allowed actions and filters are accepted', async () => {
    const sub = await subscription();
    for (const action of ['activate', 'confirm', 'quote', 'revise', 'delete']) await act(sub, action, {}, 400);
    await act(sub, 'accept', { customer_id: users.OTHER.id }, 400);
    await act(sub, 'renew', { expiry_date: '2026-02-30' }, 400);
    for (const query of ['customer_id=1', 'status=DRAFT', 'page=0', 'pageSize=101', 'search[]=x'])
      await request('/portal/subscriptions?' + query, { status: 400 });
    await request('/portal/invoices?customer_id=1', { status: 400 });
    await request('/portal/subscriptions/nope', { status: 400 });
  });
  await check('quotation acceptance serializes concurrent requests and respects expiry', async () => {
    const sub = await subscription();
    const results = await Promise.all([1, 2].map(() => fetch(base + `/portal/subscriptions/${sub.id}/actions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tokens.CUSTOMER }, body: '{"action":"accept"}',
    })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal((await request('/portal/subscriptions/' + sub.id)).status, 'CONFIRMED');
    for (const options of [{ validUntil: addDays(asOf, -1) }, { end: addDays(asOf, -1) }]) {
      const expired = await subscription(options);
      assert.ok(!(await request('/portal/subscriptions/' + expired.id)).available_actions.includes('accept'));
      await act(expired, 'accept', {}, 409);
    }
  });
  await check('plan permissions, pause cursor, renewal and terminal closure stay consistent', async () => {
    const restricted = await subscription({ status: 'ACTIVE', rules: false });
    assert.deepEqual((await request('/portal/subscriptions/' + restricted.id)).available_actions, []);
    for (const action of ['pause', 'close']) await act(restricted, action, {}, 409);
    await act(restricted, 'renew', { expiry_date: addDays(expiry, 1) }, 409);
    const sub = await subscription({ status: 'ACTIVE' });
    assert.equal((await act(sub, 'pause')).next_billing_date, asOf);
    await act(sub, 'renew', { expiry_date: expiry }, 400);
    assert.equal((await act(sub, 'renew', { expiry_date: addDays(expiry, 1) })).expiry_date, addDays(expiry, 1));
    assert.equal((await act(sub, 'resume')).next_billing_date, asOf);
    const closed = await act(sub, 'close');
    assert.equal(closed.status, 'CLOSED'); assert.equal(closed.next_billing_date, null);
    assert.deepEqual(closed.available_actions, []);
    await act(sub, 'resume', {}, 409);
    const expired = await subscription({ status: 'PAUSED', rules: false, end: addDays(asOf, -1) });
    await act(expired, 'resume', {}, 409);
    assert.equal((await act(expired, 'close')).status, 'CLOSED');
  });
  await check('customer accepts, staff activates and bills, payments appear without internal details', async () => {
    const sub = await subscription();
    await act(sub, 'accept');
    await staff(`/subscriptions/${sub.id}/actions`, { action: 'activate' });
    const draft = await staff('/invoices', { subscription_id: sub.id }, 201);
    await request('/portal/invoices/' + draft.id, { status: 404 });
    await staff(`/invoices/${draft.id}/actions`, { action: 'confirm' });
    assert.equal((await request('/portal/summary')).outstanding, 200);
    await staff('/payments', { invoice_id: draft.id, method: 'UPI', amount: 75, date: asOf, note: 'Private payment note' }, 201);
    let detail = await request('/portal/invoices/' + draft.id);
    assert.equal(detail.balance, 125); assert.equal(detail.amount_paid, 75);
    assert.equal(detail.lines.length, 2);
    assert.deepEqual(Object.keys(detail.payments[0]).sort(), ['amount', 'date', 'id', 'method']);
    assert.ok(!JSON.stringify(detail).includes('Private'));
    await staff('/payments', { invoice_id: draft.id, method: 'BANK_TRANSFER', amount: 125, date: asOf }, 201);
    detail = await request('/portal/invoices/' + draft.id);
    assert.equal(detail.status, 'PAID'); assert.equal(detail.balance, 0);
    assert.equal((await request('/portal/summary')).outstanding, 0);
    assert.equal((await request('/dashboard', { role: 'STAFF' })).summary.collected, 200);
    await request('/payments', { method: 'POST', body: { invoice_id: draft.id, amount: 1 }, status: 403 });
  });
  await check('issued invoice lists and totals exclude other owners, drafts, future and cancelled debt', async () => {
    const issued = await invoice({ paid: 25 });
    const cancelled = await invoice({ status: 'CANCELLED' });
    const settled = await invoice({ status: 'PAID', paid: 100 });
    for (const options of [{ owner: 'OTHER' }, { status: 'DRAFT' }, { date: addDays(asOf, 1) }]) {
      const hidden = await invoice(options);
      await request('/portal/invoices/' + hidden.id, { status: 404 });
    }
    const list = await request('/portal/invoices');
    assert.deepEqual(list.items.map(i => i.id).sort(), [issued.id, cancelled.id, settled.id].sort());
    assert.equal(list.items.find(i => i.id === issued.id).is_overdue, true);
    const summary = await request('/portal/summary');
    assert.equal(summary.outstanding, 75); assert.equal(summary.overdue, 75);
    assert.equal((await request('/portal/invoices?status=PAID')).total, 1);
    assert.equal((await request('/portal/invoices?subscription_id=' + issued.subscription_id)).total, 1);
    assert.equal((await request('/portal/invoices?search=%25')).total, 0);
  });
  await check('pagination is stable and search treats wildcards literally', async () => {
    await subscription({ name: '100%_Growth' }); await subscription(); await subscription();
    const first = await request('/portal/subscriptions?pageSize=2');
    const second = await request('/portal/subscriptions?pageSize=2&page=2');
    assert.equal(first.total, 3); assert.equal(second.items.length, 1);
    assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 3);
    assert.equal((await request('/portal/subscriptions?search=%25_')).total, 1);
    assert.equal((await request('/portal/subscriptions?status=ACTIVE')).total, 0);
  });
  await check('profile edits only change permitted fields on the authenticated customer', async () => {
    const body = { name: 'Acme Customer', company: 'Acme', phone: '+91 12345', address: 'First line\nSecond line' };
    const updated = await request('/portal/profile', { method: 'PUT', body });
    assert.equal(updated.name, body.name); assert.equal(updated.role, 'CUSTOMER');
    assert.equal('password_hash' in updated, false);
    for (const extra of [{ role: 'ADMIN' }, { email: 'new@example.com' }, { id: users.OTHER.id }, { password_hash: 'x' }])
      await request('/portal/profile', { method: 'PUT', body: { ...body, ...extra }, status: 400 });
    await request('/portal/profile', { method: 'PUT', body: { name: 'x' }, status: 400 });
    const saved = await one('SELECT * FROM users WHERE id=$1', [users.CUSTOMER.id]);
    assert.equal(saved.email, users.CUSTOMER.email); assert.equal(saved.password_hash, 'private-password-hash');
    assert.equal((await request('/portal/profile', { role: 'OTHER' })).name, 'OTHER');
  });
});
