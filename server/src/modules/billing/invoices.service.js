// Reading invoices and the actions staff can take on them: confirm, cancel, send.
import { query, transaction } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { sendEmail } from '../../lib/email.js';
import { today } from '../../lib/dates.js';

// Overdue = confirmed, past its due date, and not fully paid. One rule, used everywhere.
export const overdueSql = param => `(i.status='CONFIRMED' AND i.due_date < ${param} AND i.amount_paid < i.total)`;
const escapeLike = text => '%' + text.replace(/[\\%_]/g, '\\$&') + '%';

export async function getInvoice(id, client = { query }) {
  const { rows: [invoice] } = await client.query(`SELECT i.*, ${overdueSql('$2')} AS is_overdue, (i.total - i.amount_paid) AS balance,
      s.number AS subscription_number, u.name AS customer_name, u.email AS customer_email,
      u.company AS customer_company, u.address AS customer_address, u.phone AS customer_phone
    FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id JOIN users u ON u.id=i.customer_id WHERE i.id=$1`, [id, today()]);
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  const [lines, payments] = await Promise.all([
    client.query('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY id', [id]),
    client.query(`SELECT p.*, r.name AS recorded_by_name FROM payments p LEFT JOIN users r ON r.id=p.recorded_by_id
      WHERE p.invoice_id=$1 ORDER BY p.date, p.id`, [id]),
  ]);
  return { ...invoice, lines: lines.rows, payments: payments.rows };
}

export async function listInvoices(f) {
  const params = [];
  const where = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', '$' + params.length)); };
  if (f.search) {
    params.push(escapeLike(f.search));
    const n = '$' + params.length;
    where.push(`(i.number ILIKE ${n} OR u.name ILIKE ${n} OR u.email ILIKE ${n} OR s.number ILIKE ${n})`);
  }
  if (f.status) add('i.status = ?', f.status);
  if (f.overdue) { params.push(today()); where.push(overdueSql('$' + params.length)); }
  if (f.unpaid) where.push(`i.status='CONFIRMED' AND i.amount_paid < i.total`);
  if (f.customer_id) add('i.customer_id = ?', f.customer_id);
  if (f.subscription_id) add('i.subscription_id = ?', f.subscription_id);
  if (f.from) add('i.invoice_date >= ?', f.from);
  if (f.to) add('i.invoice_date <= ?', f.to);
  const from = `FROM invoices i JOIN users u ON u.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const [list, totals] = await Promise.all([
    query(`SELECT i.id, i.number, i.status, i.invoice_date, i.due_date, i.total, i.amount_paid, (i.total - i.amount_paid) AS balance,
        ${overdueSql('$' + (params.length + 1))} AS is_overdue, i.sent_at, u.name AS customer_name, u.company AS customer_company,
        s.number AS subscription_number, i.subscription_id
      ${from} ORDER BY i.invoice_date DESC, i.id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`, [...params, today()]),
    query(`SELECT count(*)::int AS total, COALESCE(sum(CASE WHEN i.status='CONFIRMED' THEN i.total - i.amount_paid ELSE 0 END), 0) AS balance ${from}`, params),
  ]);
  return { items: list.rows, total: totals.rows[0].total, balance: totals.rows[0].balance, page: f.page, pageSize: f.pageSize };
}

export async function lockInvoice(client, id) {
  const { rows: [invoice] } = await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id]);
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  return invoice;
}

// DRAFT -> CONFIRMED (or straight to PAID when there is nothing to pay).
async function confirmLocked(client, invoice) {
  if (invoice.status !== 'DRAFT') throw new HttpError(409, 'Only draft invoices can be confirmed');
  await client.query(`UPDATE invoices SET status = CASE WHEN total = 0 THEN 'PAID'::invoice_status ELSE 'CONFIRMED'::invoice_status END WHERE id=$1`, [invoice.id]);
}

export async function applyInvoiceAction(id, action) {
  if (action === 'send') return sendInvoice(id);
  await transaction(async client => {
    const invoice = await lockInvoice(client, id);
    if (action === 'confirm') return confirmLocked(client, invoice);
    // cancel
    if (!['DRAFT', 'CONFIRMED'].includes(invoice.status)) throw new HttpError(409, `A ${invoice.status.toLowerCase()} invoice cannot be cancelled`);
    if (Number(invoice.amount_paid) > 0) throw new HttpError(409, 'This invoice has payments recorded. Remove them before cancelling');
    await client.query(`UPDATE invoices SET status='CANCELLED' WHERE id=$1`, [id]);
    // Give the discount uses back. A cancelled period is not billed again.
    if (invoice.applied_discount_ids.length) await client.query(`UPDATE discounts SET used_count = GREATEST(used_count - 1, 0)
      WHERE id IN (SELECT id FROM discounts WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE)`, [invoice.applied_discount_ids]);
  });
  return getInvoice(id);
}

export async function confirmAllDrafts() {
  return transaction(async client => {
    const { rows } = await client.query(`UPDATE invoices SET status = CASE WHEN total = 0 THEN 'PAID'::invoice_status ELSE 'CONFIRMED'::invoice_status END
      WHERE status='DRAFT' RETURNING id`);
    return { confirmed: rows.length };
  });
}

async function sendInvoice(id) {
  const invoice = await getInvoice(id);
  if (invoice.status === 'DRAFT') throw new HttpError(409, 'Confirm the invoice before sending it');
  if (invoice.status === 'CANCELLED') throw new HttpError(409, 'A cancelled invoice cannot be sent');
  const lines = invoice.lines.map(l => `  - ${l.description} x${l.quantity}: INR ${Number(l.amount).toFixed(2)}`).join('\n');
  await sendEmail({
    to: invoice.customer_email, subject: `Invoice ${invoice.number} from Brightloop`,
    text: `Hi ${invoice.customer_name},\n\nYour invoice ${invoice.number} for ${invoice.period_start} to ${invoice.period_end}:\n${lines}\n\nTotal: INR ${Number(invoice.total).toFixed(2)}\nDue by: ${invoice.due_date}\n`,
  });
  await query('UPDATE invoices SET sent_at=now() WHERE id=$1', [id]);
  return getInvoice(id);
}
