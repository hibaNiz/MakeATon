import { nextNumber } from '../../lib/db.js';
import { addDays } from '../../lib/dates.js';
import { priceInvoice } from './pricing.js';

async function invoicePrices(client, subscription, plan, window) {
  const { rows: lines } = await client.query(`SELECT sl.*,p.name AS product_name,
    v.attribute AS variant_attribute,v.value AS variant_value,t.rate AS tax_rate,t.active AS tax_active
    FROM subscription_lines sl JOIN products p ON p.id=sl.product_id
    LEFT JOIN product_variants v ON v.id=sl.variant_id LEFT JOIN taxes t ON t.id=sl.tax_id
    WHERE sl.subscription_id=$1 ORDER BY sl.id`, [subscription.id]);
  // All workers lock shared discounts in ID order. Read the mappings after any
  // wait so a concurrent catalog edit cannot supply stale product eligibility.
  const { rows: discounts } = await client.query(`SELECT d.* FROM discounts d
    WHERE d.id=$1 OR (d.scope='PRODUCT' AND EXISTS (SELECT 1 FROM discount_products dp
      WHERE dp.discount_id=d.id AND dp.product_id=ANY($2::int[])))
    ORDER BY d.id FOR UPDATE`, [subscription.discount_id, lines.map(line => line.product_id)]);
  const { rows: mappings } = await client.query(`SELECT discount_id,product_id FROM discount_products
    WHERE discount_id=ANY($1::int[])`, [discounts.map(discount => discount.id)]);
  for (const discount of discounts) discount.product_ids = mappings
    .filter(mapping => mapping.discount_id === discount.id).map(mapping => mapping.product_id);
  return priceInvoice({ plan, lines, discounts, discount_id: subscription.discount_id,
    date: window.period_start, billable_days: window.billable_days, period_days: window.period_days });
}

// The caller holds the subscription row lock and commits the cursor with this invoice.
export async function createPeriodInvoice(client, subscription, plan, window, invoiceDate, confirm) {
  const existing = await client.query('SELECT id FROM invoices WHERE subscription_id=$1 AND period_start=$2',
    [subscription.id, window.period_start]);
  // A cancelled, paid or draft invoice also owns its period: billing never replaces it.
  if (existing.rowCount) return { created: false, id: existing.rows[0].id };
  const prices = await invoicePrices(client, subscription, plan, window);
  const number = await nextNumber(client, 'INV');
  const { rows: [invoice] } = await client.query(`INSERT INTO invoices
    (number,subscription_id,customer_id,status,invoice_date,due_date,period_start,period_end,
      billable_days,period_days,subtotal,discount_total,tax_total,total,applied_discount_ids)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (subscription_id,period_start) DO NOTHING RETURNING id,number`,
  [number, subscription.id, subscription.customer_id, confirm ? (Number(prices.total) === 0 ? 'PAID' : 'CONFIRMED') : 'DRAFT', invoiceDate,
    addDays(invoiceDate, subscription.payment_term_days), window.period_start, window.period_end,
    window.billable_days, window.period_days, prices.subtotal, prices.discount_total, prices.tax_total,
    prices.total, prices.applied_discount_ids]);
  if (!invoice) return { created: false };
  await client.query(`INSERT INTO invoice_lines
    (invoice_id,description,quantity,unit_price,discount_amount,tax_rate,tax_amount,amount)
    SELECT $1,description,quantity,unit_price,discount_amount,tax_rate,tax_amount,amount
    FROM jsonb_to_recordset($2::jsonb) AS line(description TEXT,quantity INT,unit_price NUMERIC,
      discount_amount NUMERIC,tax_rate NUMERIC,tax_amount NUMERIC,amount NUMERIC)`, [invoice.id, JSON.stringify(prices.lines)]);
  // Drafts reserve discount usage too; later cancellation can return these IDs.
  await client.query('UPDATE discounts SET used_count=used_count+1 WHERE id=ANY($1::int[])', [prices.applied_discount_ids]);
  return { created: true, ...invoice };
}
