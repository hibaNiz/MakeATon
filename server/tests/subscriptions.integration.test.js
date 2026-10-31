import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Subscriptions HTTP API with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'subscriptions_test_' + randomUUID().replaceAll('-', '');
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
  const plan = await request('/plans', { method: 'POST', status: 201, body: {
    name: 'Monthly', price: 99, billing_period: 'MONTHLY', min_quantity: 2,
    auto_close: true, closable: true, pausable: true, renewable: true,
  } });
  const tax = await request('/taxes', { method: 'POST', status: 201, body: { name: 'GST', rate: 18 } });
  const product = await request('/products', { method: 'POST', status: 201, body: {
    name: 'CRM', type: 'SOFTWARE', sales_price: 1200, cost_price: 100, tax_id: tax.id,
    variants: [{ attribute: 'Brand', value: 'Odoo', extra_price: 560 }],
  } });
  const templateData = { name: 'CRM team', plan_id: plan.id, validity_days: 30,
    lines: [{ product_id: product.id, variant_id: product.variants[0].id, quantity: 2 }] };

  await t.test('template access requires staff and validates IDs and pagination', async () => {
    await request('/templates', { role: null, status: 401 });
    for (const method of ['GET', 'POST', 'PUT', 'DELETE'])
      await request('/templates' + (['PUT', 'DELETE'].includes(method) ? '/1' : ''), { role: 'CUSTOMER', method, body: method === 'GET' ? undefined : {}, status: 403 });
    await request('/templates?page=0', { status: 400 });
    await request('/templates?pageSize=101', { status: 400 });
    await request('/templates/not-an-id', { status: 400 });
    await request('/templates/2147483647', { status: 404 });
  });
  await t.test('templates can be created, edited, searched literally and deleted', async () => {
    const template = await request('/templates', { method: 'POST', body: templateData, status: 201 });
    assert.equal(template.lines[0].variant_value, 'Odoo');
    await request('/templates/' + template.id, { method: 'PUT', body: { ...templateData, name: '100% Team', validity_days: 14 } });
    const found = await request('/templates?search=%25&pageSize=1');
    assert.equal(found.total, 1);
    assert.equal(found.items[0].validity_days, 14);
    await request('/templates/' + template.id, { method: 'DELETE', status: 204 });
    await request('/templates/' + template.id, { method: 'DELETE', status: 404 });
    assert.equal((await pool.query('SELECT * FROM template_lines WHERE template_id=$1', [template.id])).rowCount, 0);
  });
  await t.test('template validation rejects forged prices, duplicate lines and insufficient quantity', async () => {
    for (const patch of [{ validity_days: 0 }, { lines: [] }, { lines: [...templateData.lines, ...templateData.lines] },
      { lines: [{ ...templateData.lines[0], quantity: 1 }] }, { lines: [{ ...templateData.lines[0], unit_price: 0 }] }]) {
      await request('/templates', { method: 'POST', body: { ...templateData, ...patch }, status: 400 });
    }
  });
  await t.test('invalid and archived selections roll back the whole template edit', async () => {
    const template = await request('/templates', { method: 'POST', body: templateData, status: 201 });
    const other = await request('/products', { method: 'POST', status: 201, body: {
      name: 'Other', type: 'SERVICE', sales_price: 10, cost_price: 0,
      variants: [{ attribute: 'Size', value: 'Large', extra_price: 1 }],
    } });
    await request('/templates/' + template.id, { method: 'PUT', status: 400, body: { ...templateData, name: 'Must roll back',
      lines: [{ ...templateData.lines[0], variant_id: other.variants[0].id }] } });
    assert.equal((await request('/templates/' + template.id)).name, templateData.name);
    await request('/products/' + product.id, { method: 'PATCH', body: { active: false } });
    await request('/templates', { method: 'POST', status: 400, body: templateData });
    await request('/products/' + product.id, { method: 'PATCH', body: { active: true } });
    await request('/templates', { method: 'POST', status: 400, body: { ...templateData, plan_id: 2147483647 } });
  });
});
