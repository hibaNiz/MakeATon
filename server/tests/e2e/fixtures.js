import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import express from 'express';
import bcrypt from 'bcryptjs';

export const password = 'Portal@Test123';
export const test = base.extend({
  app: [async ({}, use) => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test.');
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (!url.pathname.endsWith('_test')) throw new Error('E2E tests require a database name ending in _test.');
    const schema = 'portal_e2e_' + randomUUID().replaceAll('-', '');
    const adminPool = new pg.Pool({ connectionString: url.href });
    let pool, server;
    try {
      await adminPool.query(`CREATE SCHEMA ${schema}`);
      url.searchParams.set('options', '-csearch_path=' + schema);
      process.env.DATABASE_URL = url.href;
      process.env.JWT_SECRET = randomUUID();
      delete process.env.SMTP_HOST;
      ({ pool } = await import('../../src/lib/db.js'));
      await pool.query(await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
      const { signToken } = await import('../../src/lib/auth.js');
      const accounts = {};
      const hash = await bcrypt.hash(password, 4);
      for (const role of ['ADMIN', 'STAFF']) {
        const { rows: [user] } = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *',
          [role + ' Tester', role.toLowerCase() + '@test.example', hash, role]);
        accounts[role.toLowerCase()] = { ...user, token: signToken(user) };
      }
      const { createApp } = await import('../../src/app.js');
      const app = await createApp();
      const dist = fileURLToPath(new URL('../../../client/dist/', import.meta.url));
      await readFile(dist + 'index.html');
      app.use(express.static(dist));
      app.get('*', (_req, res) => res.sendFile(dist + 'index.html'));
      server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
      const baseURL = 'http://127.0.0.1:' + server.address().port;
      const api = async (path, token, body, method = body === undefined ? 'GET' : 'POST') => {
        const response = await fetch(baseURL + '/api' + path, { method,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body) });
        const data = await response.json();
        expect(response.ok, method + ' ' + path + ': ' + JSON.stringify(data)).toBeTruthy();
        return data;
      };
      await use({ baseURL, api, accounts, pool });
    } finally {
      if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      if (pool) await pool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  }, { scope: 'worker' }],
  baseURL: async ({ app }, use) => use(app.baseURL),
});

export { expect };

export async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

export async function action(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function catalog(app, suffix) {
  const token = app.accounts.admin.token;
  const tax = await app.api('/taxes', token, { name: 'Tax ' + suffix, rate: 10 });
  const product = await app.api('/products', token, { name: 'Workspace ' + suffix, type: 'SOFTWARE', sales_price: 100, cost_price: 20,
    tax_id: tax.id, variants: [{ attribute: 'Edition', value: 'Pro', extra_price: 10 }] });
  const plan = await app.api('/plans', token, { name: 'Growth ' + suffix, price: 200, billing_period: 'MONTHLY', min_quantity: 1,
    auto_close: true, closable: true, pausable: true, renewable: true });
  return { product, plan };
}
