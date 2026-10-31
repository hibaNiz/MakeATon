import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import 'dotenv/config';

test('Billing engine with PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to a dedicated database ending in _test',
}, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const admin = new pg.Pool({ connectionString: url.href });
  const schema = 'billing_test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', '-csearch_path=' + schema);
  process.env.DATABASE_URL = url.href;
  process.env.JWT_SECRET = randomUUID();
  const { pool } = await import('../src/lib/db.js');
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  });
  await pool.query(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  const { runBilling } = await import('../src/modules/billing/billing.service.js');
  const { today, addDays } = await import('../src/lib/dates.js');
  const currentDate = today();
  const one = async (sql, values = []) => (await pool.query(sql, values)).rows[0];
  const customer = await one("INSERT INTO users (name,email,password_hash) VALUES ('Customer','billing@example.com','unused') RETURNING *");
  const tax = await one("INSERT INTO taxes (name,rate) VALUES ('GST',18) RETURNING *");

  async function subscription(options = {}) {
    const plan = await one(`INSERT INTO plans (name,price,billing_period,auto_close)
      VALUES ('Monthly',$1,$2,$3) RETURNING *`, [options.price ?? 100, options.period || 'MONTHLY', options.auto_close ?? false]);
    const product = await one("INSERT INTO products (name,sales_price,cost_price,tax_id) VALUES ('CRM',100,0,$1) RETURNING *", [tax.id]);
    const sub = await one(`INSERT INTO subscriptions (number,customer_id,plan_id,status,start_date,expiry_date,next_billing_date,discount_id)
      VALUES ($1,$2,$3,$4,$5,$6,$5,$7) RETURNING *`, [randomUUID(), customer.id, plan.id,
      options.status || 'ACTIVE', options.start || currentDate, options.expiry || null, options.discount_id || null]);
    await pool.query('INSERT INTO subscription_lines (subscription_id,product_id,quantity,unit_price,tax_id) VALUES ($1,$2,$3,100,$4)',
      [sub.id, product.id, options.quantity ?? 2, tax.id]);
    return { ...sub, plan, product };
  }
  async function discount(options = {}) {
    return one(`INSERT INTO discounts (name,type,value,scope,usage_limit,start_date,end_date)
      VALUES ('Savings','FIXED',$1,'SUBSCRIPTION',$2,$3,$4) RETURNING *`,
    [options.value ?? 28, options.usage_limit ?? null, options.start_date || null, options.end_date || null]);
  }
  const run = (sub, options) => runBilling({ subscription_id: sub.id, ...options });
  const getSub = sub => one('SELECT * FROM subscriptions WHERE id=$1', [sub.id]);
  const invoices = async sub => (await pool.query('SELECT * FROM invoices WHERE subscription_id=$1 ORDER BY period_start', [sub.id])).rows;

  await t.test('invoices snapshot prices, taxes and discounts, with payment terms from issue date', async () => {
    const d = await discount();
    const sub = await subscription({ discount_id: d.id });
    const pd = await one("INSERT INTO discounts (name,type,value,scope) VALUES ('Product savings','PERCENTAGE',10,'PRODUCT') RETURNING *");
    await pool.query('INSERT INTO discount_products VALUES ($1,$2)', [pd.id, sub.product.id]);
    await pool.query('UPDATE products SET sales_price=999,active=false WHERE id=$1', [sub.product.id]);
    await pool.query('UPDATE plans SET active=false WHERE id=$1', [sub.plan.id]);
    const result = await run(sub);
    assert.equal(result.created, 1); assert.deepEqual(result.errors, []); assert.equal(result.has_more, false);
    const [invoice] = await invoices(sub);
    assert.equal(invoice.status, 'CONFIRMED');
    assert.equal(invoice.invoice_date, currentDate); assert.equal(invoice.due_date, addDays(currentDate, 15));
    assert.equal(invoice.subtotal, 300); assert.equal(invoice.discount_total, 48);
    assert.equal(invoice.tax_total, 29.16); assert.equal(invoice.total, 281.16);
    assert.equal(invoice.amount_paid, 0); assert.equal(invoice.sent_at, null);
    assert.deepEqual(invoice.applied_discount_ids, [d.id, pd.id]);
    const lines = (await pool.query('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY id', [invoice.id])).rows;
    assert.equal(lines.length, 2); assert.equal(lines[1].unit_price, 100); assert.equal(lines[1].amount, 191.16);
    await pool.query('UPDATE products SET name=$1 WHERE id=$2', ['Renamed', sub.product.id]);
    await pool.query('UPDATE taxes SET rate=25 WHERE id=$1', [tax.id]);
    assert.equal((await one('SELECT * FROM invoice_lines WHERE id=$1', [lines[1].id])).description, 'CRM');
    assert.equal((await invoices(sub))[0].tax_total, 29.16);
    await pool.query('UPDATE taxes SET rate=18 WHERE id=$1', [tax.id]);
    assert.equal((await run(sub)).created, 0);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 1);
  });

  await t.test('bounded catch-up preserves month ends and prorates the final period before closing', async () => {
    const sub = await subscription({ start: '2024-01-31', expiry: '2024-04-09', auto_close: true });
    const first = await run(sub, { limit: 2 });
    assert.equal(first.created, 2); assert.equal(first.has_more, true); assert.equal(first.closed, 0);
    assert.equal((await getSub(sub)).next_billing_date, '2024-03-31');
    const last = await run(sub);
    assert.equal(last.created, 1); assert.equal(last.closed, 1); assert.equal(last.has_more, false);
    const saved = await invoices(sub);
    assert.deepEqual(saved.map(invoice => invoice.period_start), ['2024-01-31', '2024-02-29', '2024-03-31']);
    assert.deepEqual(saved.map(invoice => invoice.period_end), ['2024-02-28', '2024-03-30', '2024-04-09']);
    assert.equal(saved[2].billable_days, 10); assert.equal(saved[2].period_days, 30);
    assert.equal(saved[2].subtotal, 100); assert.equal(saved[2].tax_total, 12); assert.equal(saved[2].total, 112);
    assert.equal((await getSub(sub)).status, 'CLOSED'); assert.equal((await getSub(sub)).next_billing_date, null);
  });

  await t.test('paused subscriptions keep pending dates and catch up after resuming', async () => {
    const sub = await subscription({ start: addDays(currentDate, -2), period: 'DAILY', status: 'PAUSED' });
    assert.equal((await run(sub)).created, 0); assert.equal((await getSub(sub)).next_billing_date, sub.start_date);
    await pool.query("UPDATE subscriptions SET status='ACTIVE' WHERE id=$1", [sub.id]);
    assert.equal((await run(sub)).created, 3);
    assert.equal((await getSub(sub)).next_billing_date, addDays(currentDate, 1));
  });

  await t.test('renewing after a prorated invoice covers the remaining days without restarting the cycle', async () => {
    const sub = await subscription({ start: addDays(currentDate, -10), expiry: addDays(currentDate, -5) });
    assert.equal((await run(sub)).created, 1);
    assert.equal((await getSub(sub)).next_billing_date, addDays(currentDate, -4));
    const { transitionSubscription } = await import('../src/modules/subscriptions/lifecycle.service.js');
    await transitionSubscription(sub.id, { action: 'renew', expiry_date: addDays(currentDate, 40) });
    assert.equal((await run(sub)).created, 1);
    const saved = await invoices(sub);
    assert.equal(saved[1].period_start, addDays(saved[0].period_end, 1));
    assert.equal(saved[0].period_days, saved[1].period_days);
    assert.equal(saved[0].billable_days + saved[1].billable_days, saved[0].period_days);
    assert.equal(saved[1].period_end, addDays((await getSub(sub)).next_billing_date, -1));
  });

  await t.test('future, draft, quotation, confirmed and closed subscriptions are not billed', async () => {
    const future = await subscription({ start: addDays(currentDate, 1) });
    assert.equal((await run(future)).processed, 0);
    for (const status of ['DRAFT', 'QUOTATION', 'CONFIRMED', 'CLOSED']) {
      const sub = await subscription({ status });
      assert.equal((await run(sub)).created, 0);
    }
  });

  await t.test('expiry is inclusive and paused expiry closes only when the plan allows it', async () => {
    const inclusive = await subscription({ expiry: currentDate, auto_close: true });
    assert.equal((await run(inclusive)).closed, 0);
    assert.equal((await invoices(inclusive))[0].billable_days, 1);
    const paused = await subscription({ start: '2024-01-01', expiry: '2024-02-01', status: 'PAUSED' });
    assert.equal((await run(paused)).closed, 0);
    await pool.query('UPDATE plans SET auto_close=true WHERE id=$1', [paused.plan.id]);
    const result = await run(paused);
    assert.equal(result.closed, 1); assert.equal(result.created, 0);
    assert.equal((await invoices(paused)).length, 0);
  });

  await t.test('parallel runs create each period and consume its discount only once', async () => {
    const d = await discount();
    const sub = await subscription({ start: '2024-01-31', expiry: '2024-03-15', auto_close: true, discount_id: d.id });
    const results = await Promise.all(Array.from({ length: 8 }, () => run(sub)));
    assert.equal(results.reduce((n, result) => n + result.created, 0), 2);
    assert.equal(results.flatMap(result => result.errors).length, 0);
    const saved = await invoices(sub);
    assert.equal(saved.length, 2); assert.equal(new Set(saved.map(invoice => invoice.number)).size, 2);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 2);
  });

  await t.test('competing subscriptions cannot exceed a shared discount usage limit', async () => {
    const d = await discount({ usage_limit: 1 });
    const a = await subscription({ discount_id: d.id }), b = await subscription({ discount_id: d.id });
    const results = await Promise.all([run(a), run(b)]);
    assert.equal(results.flatMap(result => result.errors).length, 0);
    const saved = [...await invoices(a), ...await invoices(b)];
    assert.equal(saved.filter(invoice => invoice.applied_discount_ids.includes(d.id)).length, 1);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 1);
  });

  await t.test('draft invoices reserve usage and existing cancelled periods are never recreated', async () => {
    const d = await discount();
    const sub = await subscription({ discount_id: d.id });
    assert.equal((await run(sub, { confirm: false })).created, 1);
    const [invoice] = await invoices(sub);
    assert.equal(invoice.status, 'DRAFT');
    await pool.query("UPDATE invoices SET status='CANCELLED' WHERE id=$1", [invoice.id]);
    await pool.query('UPDATE subscriptions SET next_billing_date=start_date WHERE id=$1', [sub.id]);
    const again = await run(sub);
    assert.equal(again.created, 0); assert.equal(again.skipped, 1); assert.equal(again.has_more, false);
    assert.equal((await invoices(sub)).length, 1);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 1);
  });

  await t.test('discount eligibility uses the billed period date during overdue catch-up', async () => {
    const d = await discount({ start_date: '2024-01-01', end_date: '2024-01-31' });
    const sub = await subscription({ start: '2024-01-01', expiry: '2024-02-29', auto_close: true, discount_id: d.id });
    assert.equal((await run(sub)).created, 2);
    const saved = await invoices(sub);
    assert.equal(saved[0].discount_total, 28); assert.equal(saved[1].discount_total, 0);
  });

  await t.test('a late failure rolls back invoices, numbering, discounts and dates while other work proceeds', async () => {
    const d = await discount();
    const bad = await subscription({ discount_id: d.id }), good = await subscription();
    await pool.query("UPDATE subscriptions SET notes='reject billing' WHERE id=$1", [bad.id]);
    await pool.query(`CREATE FUNCTION reject_billing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.notes='reject billing' AND NEW.next_billing_date IS DISTINCT FROM OLD.next_billing_date THEN
        RAISE EXCEPTION 'Test cursor failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_billing BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION reject_billing()`);
    const before = await one("SELECT value FROM sequences WHERE name='INV'");
    const failed = await run(bad);
    assert.equal(failed.created, 0); assert.equal(failed.errors.length, 1); assert.equal(failed.has_more, true);
    assert.equal((await invoices(bad)).length, 0);
    assert.equal((await getSub(bad)).next_billing_date, bad.start_date);
    assert.equal((await one("SELECT value FROM sequences WHERE name='INV'")).value, before.value);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 0);
    const batch = await runBilling({ limit: 2 });
    assert.equal(batch.created, 1); assert.equal(batch.errors.length, 1); assert.equal((await invoices(good)).length, 1);
    await pool.query('DROP TRIGGER reject_billing ON subscriptions; DROP FUNCTION reject_billing()');
    assert.equal((await run(bad)).created, 1);
    assert.equal((await one('SELECT used_count FROM discounts WHERE id=$1', [d.id])).used_count, 1);
  });
});
