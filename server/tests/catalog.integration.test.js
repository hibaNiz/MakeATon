import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Catalog HTTP API with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/, 'Use a dedicated database with a name ending in _test');
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'catalog_test_' + randomUUID().replaceAll('-', '');
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
  const tokens = {};
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER']) {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [role, role.toLowerCase() + '@example.com', 'unused-test-hash', role]
    );
    tokens[role] = signToken(rows[0]);
  }
  async function request(path, { role = 'ADMIN', method = 'GET', body, status = 200 } = {}) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: 'Bearer ' + tokens[role] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = res.status === 204 ? null : await res.json();
    assert.equal(res.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const productData = { name: 'Suite', type: 'SOFTWARE', sales_price: 1200, cost_price: 100, variants: [{ attribute: 'Brand', value: 'Odoo', extra_price: 560 }] };
  const planData = { name: 'Monthly', price: 99, billing_period: 'MONTHLY', min_quantity: 1, auto_close: false, closable: true, pausable: true, renewable: true };
  const createProduct = (patch = {}) => request('/products', { method: 'POST', body: { ...productData, ...patch }, status: 201 });
  const tax = await request('/taxes', { method: 'POST', body: { name: 'GST', rate: 18 }, status: 201 });
  const product = await createProduct({ tax_id: tax.id });
  const discount = await request('/discounts', { method: 'POST', body: { name: 'Team offer', type: 'PERCENTAGE', value: 10, scope: 'PRODUCT', product_ids: [product.id], min_quantity: 10 }, status: 201 });

  await t.test('authentication and all discount mutation roles are enforced', async () => {
    for (const kind of ['products', 'plans', 'taxes', 'discounts']) {
      await request('/' + kind, { role: null, status: 401 });
      await request('/' + kind, { role: 'CUSTOMER', status: 403 });
      await request('/' + kind, { role: 'STAFF' });
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        await request('/' + kind + (method === 'POST' ? '' : '/1'), { role: 'CUSTOMER', method, body: {}, status: 403 });
      }
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await request('/discounts' + (method === 'POST' ? '' : '/' + discount.id), { method, role: 'STAFF', body: {}, status: 403 });
    await request('/catalog/price-preview', { method: 'POST', role: 'CUSTOMER', body: {}, status: 403 });
  });
  await t.test('staff can create, update, archive, restore and delete a tax', async () => {
    const created = await request('/taxes', { role: 'STAFF', method: 'POST', body: { name: 'Service tax', rate: 5 }, status: 201 });
    const updated = await request('/taxes/' + created.id, { role: 'STAFF', method: 'PUT', body: { name: 'Service tax', rate: 7.5 } });
    assert.equal(updated.rate, 7.5);
    await request('/taxes/' + created.id, { role: 'STAFF', method: 'PATCH', body: { active: false } });
    assert.equal((await request('/taxes/' + created.id)).active, false);
    await request('/taxes/' + created.id, { role: 'STAFF', method: 'PATCH', body: { active: true } });
    await request('/taxes/' + created.id, { role: 'STAFF', method: 'DELETE', status: 204 });
    await request('/taxes/' + created.id, { status: 404 });
  });
  await t.test('product edits preserve variant IDs and reject foreign IDs atomically', async () => {
    const first = await createProduct();
    const second = await createProduct({ name: 'Another suite' });
    const edited = await request('/products/' + first.id, { method: 'PUT', body: { ...productData, variants: [{ id: first.variants[0].id, attribute: 'Brand', value: 'Odoo', extra_price: 600 }] } });
    assert.equal(edited.variants[0].id, first.variants[0].id);
    assert.equal(edited.variants[0].extra_price, 600);
    await request('/products/' + first.id, { method: 'PUT', body: { ...productData, name: 'Must roll back', variants: [{ id: second.variants[0].id, attribute: 'Brand', value: 'Other', extra_price: 1 }] }, status: 400 });
    const unchanged = await request('/products/' + first.id);
    assert.equal(unchanged.name, 'Suite');
    assert.equal(unchanged.variants[0].extra_price, 600);
  });
  await t.test('invalid references and date values fail with field errors', async () => {
    const badTax = await request('/products', { method: 'POST', body: { ...productData, tax_id: 2147483647 }, status: 400 });
    assert.ok(badTax.fields.tax_id);
    await request('/discounts', { method: 'POST', body: { name: 'Missing product', type: 'FIXED', value: 10, scope: 'PRODUCT', product_ids: [2147483647] }, status: 400 });
    const dates = await request('/plans', { method: 'POST', body: { ...planData, end_date: '2026-02-30' }, status: 400 });
    assert.ok(dates.fields.end_date);
  });
  await t.test('search treats wildcard characters literally and pagination is bounded', async () => {
    await createProduct({ name: '100% Support' });
    const list = await request('/products?search=%25&pageSize=1');
    assert.equal(list.total, 1);
    assert.equal(list.items[0].name, '100% Support');
    await request('/products?page=0', { status: 400 });
    await request('/products?pageSize=101', { status: 400 });
    await request('/products/not-an-id', { status: 400 });
    await request('/products/2147483647', { method: 'DELETE', status: 404 });
  });
  await t.test('tax, product and variant references are protected, including rollback', async () => {
    const p = await createProduct();
    const plan = await request('/plans', { method: 'POST', body: planData, status: 201 });
    const template = await pool.query("INSERT INTO quotation_templates (name,plan_id) VALUES ('Sample',$1) RETURNING id", [plan.id]);
    await pool.query('INSERT INTO template_lines (template_id,product_id,variant_id) VALUES ($1,$2,$3)', [template.rows[0].id, p.id, p.variants[0].id]);
    await request('/products/' + p.id, { method: 'PUT', body: { ...productData, name: 'Must roll back', variants: [] }, status: 409 });
    assert.equal((await request('/products/' + p.id)).name, 'Suite');
    await request('/products/' + p.id, { method: 'DELETE', status: 409 });
    await request('/plans/' + plan.id, { method: 'DELETE', status: 409 });
    await request('/taxes/' + tax.id, { method: 'DELETE', status: 409 });
    await request('/products/' + product.id, { method: 'DELETE', status: 409 });
  });
  await t.test('discount associations replace atomically and usage cannot be forged', async () => {
    const data = { name: 'Updated offer', type: 'PERCENTAGE', value: 10, scope: 'PRODUCT', product_ids: [product.id], min_quantity: 10 };
    await request('/discounts/' + discount.id, { method: 'PUT', body: { ...data, product_ids: [2147483647] }, status: 400 });
    assert.deepEqual((await request('/discounts/' + discount.id)).product_ids, [product.id]);
    await request('/discounts/' + discount.id, { method: 'PUT', body: { ...data, used_count: 100 }, status: 400 });
    await request('/discounts/' + discount.id, { method: 'PUT', body: data });
    await pool.query('UPDATE discounts SET used_count=1 WHERE id=$1', [discount.id]);
    await request('/discounts/' + discount.id, { method: 'PUT', body: data });
    assert.equal((await request('/discounts/' + discount.id)).used_count, 1);
    await request('/discounts/' + discount.id, { method: 'DELETE', status: 409 });
  });
  await t.test('preview uses persisted prices, checks ownership and never redeems discounts', async () => {
    const payload = { product_id: product.id, variant_id: product.variants[0].id, quantity: 10, discount_id: discount.id, date: '2026-10-31' };
    const before = (await request('/discounts/' + discount.id)).used_count;
    for (let i = 0; i < 2; i++) {
      const result = await request('/catalog/price-preview', { method: 'POST', role: 'STAFF', body: payload });
      assert.equal(result.total, 18691.2);
      assert.equal(result.discount.eligible, true);
    }
    assert.equal((await request('/discounts/' + discount.id)).used_count, before);
    await request('/catalog/price-preview', { method: 'POST', body: { ...payload, variant_id: 2147483647 }, status: 400 });
    await request('/products/' + product.id, { method: 'PATCH', body: { active: false } });
    await request('/catalog/price-preview', { method: 'POST', body: payload, status: 400 });
    const archived = await request('/products?active=false');
    assert.ok(archived.items.some(row => row.id === product.id));
  });
});
