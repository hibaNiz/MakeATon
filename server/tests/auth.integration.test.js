import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import 'dotenv/config';

test('Account sessions and password resets with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/, 'Use a dedicated database with a name ending in _test');
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'auth_test_' + randomUUID().replaceAll('-', '');
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
  const hash = await bcrypt.hash('Original@123', 10);
  async function user(role = 'CUSTOMER') {
    const result = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *', ['Test Account', randomUUID() + '@example.com', hash, role]);
    return result.rows[0];
  }
  const request = (path, { token, body, method = body ? 'POST' : 'GET' } = {}) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const tokenHash = token => createHash('sha256').update(token).digest('hex');

  await t.test('signup normalizes email, creates a customer and hides password fields', async () => {
    const response = await request('/auth/signup', { body: { name: 'New Customer', email: '  CUSTOMER@Example.com  ', password: 'Customer@123', role: 'ADMIN' } });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.user.email, 'customer@example.com');
    assert.equal(data.user.role, 'CUSTOMER');
    assert.equal(data.user.password_hash, undefined);
    assert.equal(data.user.reset_token_hash, undefined);
    assert.equal((await request('/auth/me', { token: data.token })).status, 200);
  });

  await t.test('a reset link succeeds once when two requests arrive together', async resetTest => {
    const account = await user();
    const token = randomUUID();
    await pool.query("UPDATE users SET reset_token_hash=$1,reset_token_expiry=now()+interval '30 minutes' WHERE id=$2", [tokenHash(token), account.id]);
    // Hold hashing until both requests reach it, so both validate the same link.
    const originalHash = bcrypt.hash;
    let arrivals = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const timeout = setTimeout(release, 5000);
    const hashing = resetTest.mock.method(bcrypt, 'hash', async (...args) => {
      if (++arrivals === 2) release();
      await gate;
      return originalHash(...args);
    });
    const passwords = ['FirstNew@123', 'SecondNew@123'];
    const responses = await Promise.all(passwords.map(password => request('/auth/reset-password', { body: { token, password } })));
    clearTimeout(timeout);
    hashing.mock.restore();
    assert.equal(arrivals, 2);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
    const winner = passwords[responses.findIndex(r => r.status === 200)];
    const loser = passwords[responses.findIndex(r => r.status === 400)];
    assert.equal((await request('/auth/login', { body: { email: account.email, password: winner } })).status, 200);
    assert.equal((await request('/auth/login', { body: { email: account.email, password: loser } })).status, 401);
    assert.equal((await request('/auth/reset-password', { body: { token, password: 'ThirdNew@123' } })).status, 400);
    const stored = (await pool.query('SELECT reset_token_hash,reset_token_expiry FROM users WHERE id=$1', [account.id])).rows[0];
    assert.deepEqual(stored, { reset_token_hash: null, reset_token_expiry: null });
  });

  await t.test('expired and replaced reset links cannot change the password', async () => {
    const account = await user(), expired = randomUUID(), replacement = randomUUID();
    await pool.query("UPDATE users SET reset_token_hash=$1,reset_token_expiry=now()-interval '1 minute' WHERE id=$2", [tokenHash(expired), account.id]);
    assert.equal((await request('/auth/reset-password', { body: { token: expired, password: 'Changed@123' } })).status, 400);
    await pool.query("UPDATE users SET reset_token_hash=$1,reset_token_expiry=now()+interval '30 minutes' WHERE id=$2", [tokenHash(replacement), account.id]);
    assert.equal((await request('/auth/reset-password', { body: { token: expired, password: 'Changed@123' } })).status, 400);
    assert.equal((await request('/auth/login', { body: { email: account.email, password: 'Original@123' } })).status, 200);
  });

  await t.test('deleting an account invalidates its existing session', async () => {
    const account = await user('STAFF'), token = signToken(account);
    assert.equal((await request('/products', { token })).status, 200);
    await pool.query('DELETE FROM users WHERE id=$1', [account.id]);
    assert.equal((await request('/products', { token })).status, 401);
    assert.equal((await request('/auth/me', { token })).status, 401);
  });

  await t.test('permissions use the current account role, not stale token claims', async () => {
    const account = await user('ADMIN'), token = signToken(account);
    await pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [account.id]);
    assert.equal((await request('/products', { token })).status, 403);
    const response = await request('/auth/me', { token });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).role, 'CUSTOMER');
    assert.equal((await request('/products', { token: 'invalid' })).status, 401);
  });

  await t.test('staff can list customers but cannot list internal accounts', async () => {
    const account = await user('STAFF'), token = signToken(account);
    await user('ADMIN');
    for (const role of ['STAFF', 'ADMIN']) {
      assert.equal((await request('/users?role=' + role, { token })).status, 403);
    }
    const response = await request('/users', { token });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.items.length);
    assert.ok(data.items.every(person => person.role === 'CUSTOMER'));
  });

  await t.test('invalid people filters and IDs return validation errors', async () => {
    const token = signToken(await user('ADMIN'));
    for (const filter of ['role=OWNER', 'page=-1', 'page=Infinity', 'page=1.5', 'pageSize=101']) {
      assert.equal((await request('/users?' + filter, { token })).status, 400, filter);
    }
    for (const id of ['abc', '-1', '1.5', '2147483648']) {
      assert.equal((await request('/users/' + id, { token, method: 'PUT', body: { name: 'Updated name' } })).status, 400, id);
      assert.equal((await request('/users/' + id, { token, method: 'DELETE' })).status, 400, id);
    }
  });

  await t.test('account deletion reports missing or protected accounts accurately', async () => {
    const account = await user('ADMIN'), otherAdmin = await user('ADMIN');
    const token = signToken(account);
    assert.equal((await request('/users/' + account.id, { token, method: 'DELETE' })).status, 400);
    assert.equal((await request('/users/' + otherAdmin.id, { token, method: 'DELETE' })).status, 403);
    assert.equal((await request('/users/2147483647', { token, method: 'DELETE' })).status, 404);
    const customer = await user();
    assert.equal((await request('/users/' + customer.id, { token, method: 'DELETE' })).status, 204);
    assert.equal((await request('/users/' + customer.id, { token, method: 'DELETE' })).status, 404);
  });
});
