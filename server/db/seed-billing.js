// Optional demo data for billing: customers, active subscriptions, invoices and payments.
// Uses the same services as the app, so every rule (validation, billing dates, discounts, tax) is applied.
// Safe to run more than once: it only adds customers/subscriptions that do not exist yet.
//   npm run db:seed:billing            (about 40 customers)
//   npm run db:seed:billing -- 2000    (a bigger load, for speed checks)
import bcrypt from 'bcryptjs';
import { pool, query } from '../src/lib/db.js';
import { addDays, today } from '../src/lib/dates.js';
import { saveDraft } from '../src/modules/subscriptions/subscriptions.service.js';
import { transitionSubscription } from '../src/modules/subscriptions/lifecycle.service.js';
import { runBilling } from '../src/modules/billing/billing.service.js';
import { recordPayment } from '../src/modules/payments/payments.service.js';

const count = Math.max(1, Math.min(5000, Number(process.argv[2]) || 40));
const METHODS = ['UPI', 'BANK_TRANSFER', 'CARD', 'CASH', 'CHEQUE'];
try {
  const hash = await bcrypt.hash('Customer@1234', 4);
  const { rows: plans } = await query('SELECT id, billing_period, min_quantity FROM plans WHERE active ORDER BY id');
  const { rows: products } = await query('SELECT id FROM products WHERE active ORDER BY id');
  const { rows: [admin] } = await query("SELECT id FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1");
  if (!plans.length || !products.length) throw new Error('Run npm run db:seed first (it adds the products and plans).');
  let made = 0;
  for (let i = 1; i <= count; i++) {
    const email = `demo.customer${i}@example.com`;
    const { rows: [customer] } = await query(`INSERT INTO users (name,email,password_hash,role,company) VALUES ($1,$2,$3,'CUSTOMER',$4)
      ON CONFLICT (email) DO UPDATE SET name=users.name RETURNING id, (xmax = 0) AS created`, [`Demo Customer ${i}`, email, hash, `Company ${i}`]);
    if (!customer.created) continue;
    const plan = plans[i % plans.length];
    const start = addDays(today(), -((i * 17) % 200));
    const draft = await saveDraft({ customer_id: customer.id, plan_id: plan.id, start_date: start, payment_term_days: 15, notes: undefined,
      lines: [{ product_id: products[i % products.length].id, quantity: Math.max(plan.min_quantity, 1 + (i % 12)) }] });
    for (const action of ['quote', 'confirm', 'activate']) await transitionSubscription(draft.id, { action, ...(action === 'quote' ? { quotation_valid_until: addDays(today(), 30) } : {}) });
    made++;
  }
  const billed = await runBilling({ confirm: true });
  // Pay roughly two thirds of the open invoices, some only partly.
  const { rows: open } = await query("SELECT id, total, invoice_date FROM invoices WHERE status='CONFIRMED' AND amount_paid=0 ORDER BY id");
  let paid = 0;
  for (const [n, invoice] of open.entries()) {
    if (n % 3 === 2) continue;
    const amount = n % 5 === 0 ? Math.floor(Number(invoice.total) / 2 * 100) / 100 : Number(invoice.total);
    if (amount <= 0) continue;
    await recordPayment({ invoice_id: invoice.id, method: METHODS[n % METHODS.length], amount, date: invoice.invoice_date, note: undefined }, admin.id);
    paid++;
  }
  console.log(`Billing demo ready: ${made} new subscriptions, ${billed.created} invoices created, ${paid} payments recorded.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
