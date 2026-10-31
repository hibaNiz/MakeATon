// Recording and listing payments. An invoice's amount_paid always equals the sum of its payments:
// both change in the same transaction while the invoice row is locked.
import { query, transaction } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { today } from '../../lib/dates.js';
import { lockInvoice } from '../invoices/invoices.service.js';
import { paymentSchema, paymentFilters, recordId } from './validation.js';

const cents = value => Math.round(Number(value) * 100);
const escapeLike = text => '%' + text.replace(/[\\%_]/g, '\\$&') + '%';

export async function listPayments(filters = {}) {
  const f = paymentFilters.parse(filters);
  const params = [];
  const where = [];
  if (f.search) {
    params.push(escapeLike(f.search));
    const n = '$' + params.length;
    where.push(`(i.number ILIKE ${n} OR u.name ILIKE ${n} OR p.note ILIKE ${n})`);
  }
  for (const [value, sql] of [[f.method, 'p.method = ?'], [f.invoice_id, 'p.invoice_id = ?'], [f.customer_id, 'i.customer_id = ?'], [f.from, 'p.date >= ?'], [f.to, 'p.date <= ?']]) {
    if (!value) continue;
    params.push(value);
    where.push(sql.replace('?', '$' + params.length));
  }
  const from = `FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN users u ON u.id=i.customer_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const [list, totals] = await Promise.all([
    query(`SELECT p.id, p.invoice_id, p.method, p.amount, p.date, p.note, p.created_at, i.number AS invoice_number,
        u.name AS customer_name, r.name AS recorded_by_name
      ${from.replace('JOIN users u ON u.id=i.customer_id', 'JOIN users u ON u.id=i.customer_id LEFT JOIN users r ON r.id=p.recorded_by_id')}
      ORDER BY p.date DESC, p.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`, params),
    query(`SELECT count(*)::int AS total, COALESCE(sum(p.amount), 0) AS sum ${from}`, params),
  ]);
  return { items: list.rows, total: totals.rows[0].total, sum: totals.rows[0].sum, page: f.page, pageSize: f.pageSize };
}

export async function recordPayment(data, userId) {
  data = paymentSchema.parse(data);
  userId = recordId.parse(userId);
  return transaction(async client => {
    const invoice = await lockInvoice(client, data.invoice_id);
    const fail = (field, message) => { throw new HttpError(400, 'Please fix the highlighted fields', { [field]: message }); };
    if (invoice.status !== 'CONFIRMED') throw new HttpError(409, invoice.status === 'PAID' ? 'This invoice is already paid' : `Payments can only be recorded on confirmed invoices (this one is ${invoice.status.toLowerCase()})`);
    const balance = cents(invoice.total) - cents(invoice.amount_paid);
    if (balance <= 0) throw new HttpError(409, 'This invoice is already paid');
    if (cents(data.amount) > balance) fail('amount', `The amount is more than the balance due (${(balance / 100).toFixed(2)})`);
    if (data.date > today()) fail('date', 'The payment date cannot be in the future');
    if (data.date < invoice.invoice_date) fail('date', 'The payment date cannot be before the invoice date');
    const { rows: [payment] } = await client.query(`INSERT INTO payments (invoice_id, method, amount, date, note, recorded_by_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [invoice.id, data.method, data.amount, data.date, data.note ?? null, userId]);
    await client.query(`UPDATE invoices SET amount_paid = amount_paid + $2,
      status = CASE WHEN amount_paid + $2 >= total THEN 'PAID'::invoice_status ELSE status END WHERE id=$1`, [invoice.id, data.amount]);
    return payment;
  });
}

// Admin-only: removes a mistaken payment and reopens the invoice if it had become PAID.
export async function deletePayment(id) {
  id = recordId.parse(id);
  await transaction(async client => {
    const { rows: [found] } = await client.query('SELECT invoice_id FROM payments WHERE id=$1', [id]);
    if (!found) throw new HttpError(404, 'Payment not found');
    const invoice = await lockInvoice(client, found.invoice_id);
    const { rows: [payment] } = await client.query('DELETE FROM payments WHERE id=$1 RETURNING amount', [id]);
    if (!payment) throw new HttpError(404, 'Payment not found');
    await client.query(`UPDATE invoices SET amount_paid = amount_paid - $2,
      status = CASE WHEN status='PAID' AND total > 0 THEN 'CONFIRMED'::invoice_status ELSE status END WHERE id=$1`, [invoice.id, payment.amount]);
  });
}
