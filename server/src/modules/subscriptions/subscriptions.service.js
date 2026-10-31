import { query, transaction, nextNumber } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { invalid, selectedPlan, selectedLines, selectedDiscount } from './references.js';

export async function getSubscription(id, client) {
  if (!client) return transaction(async tx => {
    await tx.query('SELECT id FROM subscriptions WHERE id=$1 FOR SHARE', [id]);
    return getSubscription(id, tx);
  });
  const { rows: [subscription] } = await client.query(`SELECT s.*, u.name AS customer_name, u.email AS customer_email,
    p.name AS plan_name, p.price AS plan_price, p.billing_period, p.min_quantity,
    p.pausable, p.closable, p.renewable, p.auto_close, d.name AS discount_name
    FROM subscriptions s JOIN users u ON u.id=s.customer_id JOIN plans p ON p.id=s.plan_id
    LEFT JOIN discounts d ON d.id=s.discount_id WHERE s.id=$1`, [id]);
  if (!subscription) throw new HttpError(404, 'Subscription not found');
  const { rows: lines } = await client.query(`SELECT l.*, p.name AS product_name, v.attribute AS variant_attribute,
    v.value AS variant_value, t.name AS tax_name
    FROM subscription_lines l JOIN products p ON p.id=l.product_id
    LEFT JOIN product_variants v ON v.id=l.variant_id LEFT JOIN taxes t ON t.id=l.tax_id
    WHERE subscription_id=$1 ORDER BY l.id`, [id]);
  const productSubtotal = lines.reduce((sum, line) => sum + Math.round(line.unit_price * 100) * line.quantity, 0) / 100;
  return { ...subscription, lines, product_subtotal: productSubtotal };
}

export async function listSubscriptions({ search, status, customer_id, page, pageSize }) {
  const params = ['%' + search.replace(/[\\%_]/g, '\\$&') + '%'];
  const conditions = ['(s.number ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)'];
  if (status) { params.push(status); conditions.push(`s.status=$${params.length}`); }
  if (customer_id) { params.push(customer_id); conditions.push(`s.customer_id=$${params.length}`); }
  const from = `FROM subscriptions s JOIN users u ON u.id=s.customer_id JOIN plans p ON p.id=s.plan_id WHERE ${conditions.join(' AND ')}`;
  const [list, count] = await Promise.all([
    query(`SELECT s.*, u.name AS customer_name, p.name AS plan_name ${from}
      ORDER BY s.created_at DESC, s.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize]),
    query(`SELECT count(*)::int AS total ${from}`, params),
  ]);
  return { items: list.rows, total: count.rows[0].total, page, pageSize };
}

export async function lockSubscription(client, id) {
  const { rows: [subscription] } = await client.query('SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE', [id]);
  if (!subscription) throw new HttpError(404, 'Subscription not found');
  return subscription;
}

export async function saveDraft(data, id) {
  return transaction(async client => {
    if (id && (await lockSubscription(client, id)).status !== 'DRAFT')
      throw new HttpError(409, 'Only drafts can be edited');
    const { rows: [customer] } = await client.query('SELECT role FROM users WHERE id=$1 FOR SHARE', [data.customer_id]);
    if (customer?.role !== 'CUSTOMER') invalid('customer_id', 'Choose a customer account');
    const plan = await selectedPlan(client, data.plan_id, data.start_date);
    const lines = await selectedLines(client, data.lines, plan);
    await selectedDiscount(client, data.discount_id, lines, plan, data.start_date);
    const values = [data.customer_id, data.plan_id, data.start_date, data.expiry_date, data.payment_term_days,
      data.quotation_valid_until, data.discount_id, data.notes];
    if (id) {
      await client.query(`UPDATE subscriptions SET customer_id=$1,plan_id=$2,start_date=$3,expiry_date=$4,
        payment_term_days=$5,quotation_valid_until=$6,discount_id=$7,notes=$8,updated_at=now() WHERE id=$9`, [...values, id]);
      await client.query('DELETE FROM subscription_lines WHERE subscription_id=$1', [id]);
    } else {
      const number = await nextNumber(client, 'SUB');
      const result = await client.query(`INSERT INTO subscriptions
        (customer_id,plan_id,start_date,expiry_date,payment_term_days,quotation_valid_until,discount_id,notes,number)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [...values, number]);
      id = result.rows[0].id;
    }
    for (const line of lines) await client.query(`INSERT INTO subscription_lines
      (subscription_id,product_id,variant_id,quantity,unit_price,tax_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, line.product_id, line.variant_id, line.quantity, line.unit_price, line.tax_id]);
    return getSubscription(id, client);
  });
}

export async function deleteDraft(id) {
  return transaction(async client => {
    if ((await lockSubscription(client, id)).status !== 'DRAFT') throw new HttpError(409, 'Only drafts can be deleted');
    await client.query('DELETE FROM subscriptions WHERE id=$1', [id]);
  });
}
