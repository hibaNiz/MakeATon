// The billing engine: turns an ACTIVE subscription into invoices, one per billing period.
//
// Rules this file keeps:
//  * A period is billed at most once. The database enforces it with UNIQUE (subscription_id, period_start),
//    and each subscription is locked while it is billed, so two billing runs cannot collide.
//  * No period is skipped: if the server was off, or the subscription was activated with a past start date,
//    every missed period is billed (up to MAX_PERIODS_PER_RUN per subscription per run; the next run continues).
//  * Only ACTIVE subscriptions are billed. Periods that fall due while a subscription is paused are billed
//    after it resumes, because resuming never skips a period (see lifecycle.service.js).
//  * A period is billed when it starts on or before the subscription's expiry date (expiry is inclusive).
//    There is no proration.
//  * Product prices come from the subscription lines (saved when the draft was saved). Plan fee, discounts and
//    tax rates are read live. Discount dates are checked against the first day of the period being billed.
//  * Each invoice counts as one use of every discount it applied.
import { query, transaction, nextNumber } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { addDays, addPeriod, today } from '../../lib/dates.js';
import { lockSubscription } from '../subscriptions/subscriptions.service.js';
import { closeExpiredSubscriptions } from '../subscriptions/lifecycle.service.js';
import { calculateInvoice } from './invoice-calc.js';

const MAX_PERIODS_PER_RUN = 400;
const MAX_INVOICE_CENTS = 999999999999; // the invoices table holds up to 9,999,999,999.99

// An invoice with nothing to pay is settled at once; otherwise it follows the requested status.
export const startingStatus = (totalCents, confirmed) => !confirmed ? 'DRAFT' : totalCents === 0 ? 'PAID' : 'CONFIRMED';

/**
 * Build and save the invoice for one period. Call inside a transaction with the subscription row locked.
 * Returns the new invoice row, or null when that period was already billed.
 */
export async function createInvoiceForPeriod(client, subscription, periodStart, { confirmed = false, invoiceDate = today() } = {}) {
  const existing = await client.query('SELECT 1 FROM invoices WHERE subscription_id=$1 AND period_start=$2', [subscription.id, periodStart]);
  if (existing.rows.length) return null;

  const { rows: [plan] } = await client.query('SELECT * FROM plans WHERE id=$1', [subscription.plan_id]);
  const { rows: lines } = await client.query(`SELECT l.product_id, l.quantity, l.unit_price, p.name AS product_name,
      v.attribute, v.value AS variant_value, CASE WHEN t.active THEN t.rate ELSE 0 END AS tax_rate
    FROM subscription_lines l JOIN products p ON p.id=l.product_id
    LEFT JOIN product_variants v ON v.id=l.variant_id LEFT JOIN taxes t ON t.id=l.tax_id
    WHERE l.subscription_id=$1 ORDER BY l.id`, [subscription.id]);

  // Lock every discount we might use, in id order, so concurrent runs cannot both take the last remaining use.
  const { rows: discounts } = await client.query(`SELECT d.*,
      COALESCE((SELECT array_agg(dp.product_id) FROM discount_products dp WHERE dp.discount_id=d.id), '{}') AS product_ids
    FROM discounts d
    WHERE (d.scope='PRODUCT' AND EXISTS (SELECT 1 FROM discount_products dp WHERE dp.discount_id=d.id AND dp.product_id=ANY($1::int[])))
       OR d.id=$2
    ORDER BY d.id FOR UPDATE OF d`, [lines.map(l => l.product_id), subscription.discount_id]);

  const result = calculateInvoice({
    plan, date: periodStart, discounts: discounts.filter(d => d.scope === 'PRODUCT'),
    subscriptionDiscount: discounts.find(d => d.id === subscription.discount_id) || null,
    lines: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate,
      description: l.variant_value ? `${l.product_name} (${l.attribute}: ${l.variant_value})` : l.product_name })),
  });
  if (result.total_cents > MAX_INVOICE_CENTS) throw new HttpError(409, 'This invoice would exceed the largest supported amount (INR 9,999,999,999.99)');

  const periodEnd = addDays(addPeriod(periodStart, plan.billing_period), -1);
  const number = await nextNumber(client, 'INV');
  const { rows: [invoice] } = await client.query(`INSERT INTO invoices
      (number, subscription_id, customer_id, status, invoice_date, due_date, period_start, period_end,
       subtotal, discount_total, tax_total, total, amount_paid, applied_discount_ids)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING *`,
  [number, subscription.id, subscription.customer_id, startingStatus(result.total_cents, confirmed), invoiceDate,
    addDays(invoiceDate, subscription.payment_term_days), periodStart, periodEnd,
    result.subtotal, result.discount_total, result.tax_total, result.total,
    0, result.discount_ids]);
  if (!invoice) return null;

  for (const line of result.lines) {
    await client.query(`INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, discount_amount, tax_rate, tax_amount, amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [invoice.id, line.description, line.quantity, line.unit_price, line.discount_amount, line.tax_rate, line.tax_amount, line.amount]);
  }
  if (result.discount_ids.length) {
    await client.query(`UPDATE discounts SET used_count = used_count + 1 WHERE id = ANY($1::int[])`, [result.discount_ids]);
  }
  return invoice;
}

// A subscription can only be billed while ACTIVE, with a pending date inside its expiry.
function nextPeriodOrFail(subscription) {
  if (subscription.status !== 'ACTIVE') throw new HttpError(409, 'Only active subscriptions can be invoiced');
  if (!subscription.next_billing_date) throw new HttpError(409, 'This subscription has no pending billing date');
  if (subscription.expiry_date && subscription.next_billing_date > subscription.expiry_date)
    throw new HttpError(409, 'Every period up to the expiry date has already been billed');
  if (subscription.next_billing_date > today())
    throw new HttpError(409, `The next period starts on ${subscription.next_billing_date}. It can be invoiced then`);
  return subscription.next_billing_date;
}

// The "Create invoice" button: bill the next period of one subscription right now.
export async function billNextPeriod(subscriptionId, { confirmed = false } = {}) {
  return transaction(async client => {
    const subscription = await lockSubscription(client, subscriptionId);
    const periodStart = nextPeriodOrFail(subscription);
    const { rows: [plan] } = await client.query('SELECT billing_period FROM plans WHERE id=$1', [subscription.plan_id]);
    const invoice = await createInvoiceForPeriod(client, subscription, periodStart, { confirmed });
    if (!invoice) throw new HttpError(409, 'That period has already been invoiced');
    await client.query('UPDATE subscriptions SET next_billing_date=$1, updated_at=now() WHERE id=$2',
      [addPeriod(periodStart, plan.billing_period), subscription.id]);
    return invoice;
  });
}

/**
 * Billing day. Bills every ACTIVE subscription whose next billing date has arrived, catching up missed
 * periods, then closes expired subscriptions whose plan has auto-close on. Safe to run as often as you like.
 */
export async function runBilling({ confirm = true } = {}) {
  const asOf = today();
  const summary = { created: 0, skipped: 0, errors: 0, closed: 0, as_of: asOf };
  const { rows: due } = await query(`SELECT id FROM subscriptions WHERE status='ACTIVE' AND next_billing_date <= $1
    AND (expiry_date IS NULL OR next_billing_date <= expiry_date) ORDER BY id`, [asOf]);

  for (const { id } of due) {
    try {
      await transaction(async client => {
        // SKIP LOCKED: if another run (or a person) is already billing this subscription, leave it to them.
        const { rows: [subscription] } = await client.query(
          `SELECT * FROM subscriptions WHERE id=$1 AND status='ACTIVE' FOR UPDATE SKIP LOCKED`, [id]);
        if (!subscription) return;
        const { rows: [plan] } = await client.query('SELECT billing_period FROM plans WHERE id=$1', [subscription.plan_id]);
        let next = subscription.next_billing_date, periods = 0;
        while (next && next <= asOf && (!subscription.expiry_date || next <= subscription.expiry_date) && periods++ < MAX_PERIODS_PER_RUN) {
          const invoice = await createInvoiceForPeriod(client, subscription, next, { confirmed: confirm });
          invoice ? summary.created++ : summary.skipped++;
          next = addPeriod(next, plan.billing_period);
        }
        await client.query('UPDATE subscriptions SET next_billing_date=$1, updated_at=now() WHERE id=$2', [next, subscription.id]);
      });
    } catch (error) {
      summary.errors++;
      console.error(`Billing failed for subscription ${id}: ${error.message}`);
    }
  }
  summary.closed = (await closeExpiredSubscriptions()).closed;
  return summary;
}
