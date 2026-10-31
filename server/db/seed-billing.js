import bcrypt from 'bcryptjs';
import { pool, query } from '../src/lib/db.js';
import { addDays, today } from '../src/lib/dates.js';
import { saveDraft } from '../src/modules/subscriptions/subscriptions.service.js';
import { transitionSubscription } from '../src/modules/subscriptions/lifecycle.service.js';
import { recordPayment } from '../src/modules/payments/payments.service.js';
import { runBilling } from '../src/modules/billing/billing.service.js';
import { migrate } from './migrate.js';

const METHODS = ['UPI', 'BANK_TRANSFER', 'CARD', 'CASH', 'CHEQUE'];
const count = Number(process.argv[2] ?? 40);
try {
  if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('Choose between 1 and 5000 demo customers.');
  const { rows: [admin] } = await query("SELECT id FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1");
  if (!admin) throw new Error('Create an admin account before seeding billing data.');
  const { rows: plans } = await query('SELECT id, billing_period, min_quantity FROM plans WHERE active ORDER BY id');
  const { rows: products } = await query('SELECT id FROM products WHERE active ORDER BY id');
  if (!plans.length || !products.length) throw new Error('Run npm run db:seed first (it adds the products and plans).');
  await migrate();
  const hash = await bcrypt.hash('Customer@1234', 10);
  const subscriptionIds = [];
  let made = 0, created = 0;
  for (let i = 1; i <= count; i++) {
    const email = `demo.customer${i}@example.com`, name = `Demo Customer ${i}`, company = `Company ${i}`;
    await query(`INSERT INTO users (name,email,password_hash,role,company) VALUES ($1,$2,$3,'CUSTOMER',$4)
      ON CONFLICT (email) DO NOTHING`, [name, email, hash, company]);
    const { rows: [customer] } = await query('SELECT id,name,company,role FROM users WHERE email=$1', [email]);
    if (customer.role !== 'CUSTOMER' || customer.name !== name || customer.company !== company)
      throw new Error(`The demo email ${email} belongs to another account.`);
    const notes = `Billing demo customer ${i}`;
    let { rows: [subscription] } = await query('SELECT id,status FROM subscriptions WHERE customer_id=$1 AND notes=$2 ORDER BY id LIMIT 1', [customer.id, notes]);
    if (!subscription) {
      const plan = plans[i % plans.length];
      subscription = await saveDraft({ customer_id: customer.id, plan_id: plan.id, start_date: addDays(today(), -((i * 17) % 200)),
        payment_term_days: 15, notes, lines: [{ product_id: products[i % products.length].id, quantity: Math.max(plan.min_quantity, 1 + (i % 12)) }] });
      made++;
    }
    if (subscription.status === 'DRAFT') subscription = await transitionSubscription(subscription.id, { action: 'quote', quotation_valid_until: addDays(today(), 30) });
    if (subscription.status === 'QUOTATION') subscription = await transitionSubscription(subscription.id, { action: 'confirm' });
    if (subscription.status === 'CONFIRMED') subscription = await transitionSubscription(subscription.id, { action: 'activate' });
    subscriptionIds.push(subscription.id);
    let more = true;
    while (more) {
      const run = await runBilling({ confirm: true, limit: 500, subscription_id: subscription.id });
      if (run.errors.length) throw new Error(`Demo billing failed for subscription ${subscription.id}: ${run.errors[0].error}`);
      created += run.created;
      more = run.has_more && run.processed > 0;
    }
  }
  const { rows: open } = await query(`SELECT id,total,invoice_date FROM invoices
    WHERE subscription_id=ANY($1::int[]) AND status='CONFIRMED' AND amount_paid=0 ORDER BY id`, [subscriptionIds]);
  let paid = 0;
  for (const invoice of open) {
    if (invoice.id % 3 === 2) continue;
    const amount = invoice.id % 5 === 0 ? Math.floor(Number(invoice.total) * 100 / 2) / 100 : Number(invoice.total);
    if (amount <= 0) continue;
    await recordPayment({ invoice_id: invoice.id, method: METHODS[invoice.id % METHODS.length], amount,
      date: invoice.invoice_date, note: 'Billing demo payment' }, admin.id);
    paid++;
  }
  console.log(`Billing demo ready: ${made} new subscriptions, ${created} invoices created, ${paid} payments recorded.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
