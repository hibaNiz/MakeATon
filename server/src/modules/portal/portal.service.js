import { query, transaction } from '../../lib/db.js';
import { today } from '../../lib/dates.js';
import { HttpError } from '../../lib/errors.js';
import { getSubscription } from '../subscriptions/subscriptions.service.js';
import { transitionSubscription } from '../subscriptions/lifecycle.service.js';
import { getInvoice } from '../invoices/invoices.service.js';

const pick = (value, keys) => Object.fromEntries(keys.split(' ').map(key => [key, value[key]]));
const subscriptionFields = 'id number status plan_name plan_price billing_period start_date expiry_date quotation_valid_until next_billing_date payment_term_days discount_name product_subtotal pausable closable renewable auto_close';
const invoiceFields = 'id number status invoice_date due_date period_start period_end billable_days period_days subtotal discount_total tax_total total amount_paid balance is_overdue subscription_id subscription_number customer_name customer_email customer_company customer_address';
const profileFields = 'id, name, email, role, company, phone, address';
const escapeLike = value => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';

function customerSubscription(subscription) {
  const currentDate = today(), expired = !!subscription.expiry_date && subscription.expiry_date < currentDate;
  const actions = [];
  if (subscription.status === 'QUOTATION' && !expired && subscription.quotation_valid_until >= currentDate) actions.push('accept');
  if (subscription.status === 'ACTIVE' && subscription.pausable && !expired) actions.push('pause');
  if (subscription.status === 'PAUSED' && !expired) actions.push('resume');
  if (['QUOTATION', 'CONFIRMED'].includes(subscription.status) ||
      (['ACTIVE', 'PAUSED'].includes(subscription.status) && (subscription.closable || expired))) actions.push('close');
  if (['ACTIVE', 'PAUSED'].includes(subscription.status) && subscription.renewable && subscription.expiry_date) actions.push('renew');
  return { ...pick(subscription, subscriptionFields), as_of: currentDate, available_actions: actions,
    lines: subscription.lines.map(line => pick(line, 'id product_name variant_attribute variant_value quantity unit_price tax_name')) };
}

export async function getPortalSummary(customerId) {
  const asOf = today();
  const { rows: [summary] } = await query(`SELECT
    (SELECT count(*)::int FROM subscriptions WHERE customer_id=$1 AND status='ACTIVE' AND start_date <= $2 AND (expiry_date IS NULL OR expiry_date >= $2)) AS active,
    (SELECT count(*)::int FROM subscriptions WHERE customer_id=$1 AND status='QUOTATION' AND quotation_valid_until >= $2 AND (expiry_date IS NULL OR expiry_date >= $2)) AS quotations,
    COALESCE(sum(GREATEST(total-amount_paid,0)),0) AS outstanding,
    COALESCE(sum(GREATEST(total-amount_paid,0)) FILTER (WHERE due_date < $2),0) AS overdue
    FROM invoices WHERE customer_id=$1 AND status='CONFIRMED' AND invoice_date <= $2`, [customerId, asOf]);
  return { ...summary, as_of: asOf };
}

export async function listPortalSubscriptions(customerId, filters) {
  const params = [customerId, escapeLike(filters.search)];
  const status = filters.status ? (params.push(filters.status), ' AND s.status=$3') : '';
  const from = `FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.customer_id=$1 AND s.status!='DRAFT'
    AND (s.number ILIKE $2 OR p.name ILIKE $2)${status}`;
  const [list, count] = await Promise.all([
    query(`SELECT s.id,s.number,s.status,s.start_date,s.expiry_date,s.quotation_valid_until,s.next_billing_date,
      p.name AS plan_name,p.billing_period ${from} ORDER BY s.created_at DESC,s.id DESC LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}`, params),
    query(`SELECT count(*)::int AS total ${from}`, params),
  ]);
  return { items: list.rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
}

export async function getPortalSubscription(customerId, id) {
  return transaction(async client => {
    const { rowCount } = await client.query("SELECT id FROM subscriptions WHERE id=$1 AND customer_id=$2 AND status!='DRAFT' FOR SHARE", [id, customerId]);
    if (!rowCount) throw new HttpError(404, 'Subscription not found');
    return customerSubscription(await getSubscription(id, client));
  });
}

export async function actOnPortalSubscription(customerId, id, data) {
  return customerSubscription(await transitionSubscription(id, { ...data, action: data.action === 'accept' ? 'confirm' : data.action }, { customerId }));
}

export async function listPortalInvoices(customerId, filters) {
  const params = [customerId, escapeLike(filters.search), today()];
  let condition = '';
  if (filters.status) { params.push(filters.status); condition += ` AND i.status=$${params.length}`; }
  if (filters.subscription_id) { params.push(filters.subscription_id); condition += ` AND i.subscription_id=$${params.length}`; }
  const from = `FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id WHERE i.customer_id=$1 AND i.status!='DRAFT'
    AND (i.number ILIKE $2 OR s.number ILIKE $2) AND i.invoice_date <= $3${condition}`;
  const [list, count] = await Promise.all([
    query(`SELECT i.id,i.number,i.status,i.invoice_date,i.due_date,i.total,i.amount_paid,i.total-i.amount_paid AS balance,
      (i.status='CONFIRMED' AND i.due_date < $3 AND i.total > i.amount_paid) AS is_overdue,s.number AS subscription_number,
      i.subscription_id ${from} ORDER BY i.invoice_date DESC,i.id DESC LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}`, params),
    query(`SELECT count(*)::int AS total ${from}`, params),
  ]);
  return { items: list.rows, total: count.rows[0].total, page: filters.page, pageSize: filters.pageSize };
}

export async function getPortalInvoice(customerId, id) {
  return transaction(async client => {
    const { rowCount } = await client.query("SELECT id FROM invoices WHERE id=$1 AND customer_id=$2 AND status!='DRAFT' AND invoice_date <= $3 FOR SHARE", [id, customerId, today()]);
    if (!rowCount) throw new HttpError(404, 'Invoice not found');
    const invoice = await getInvoice(id, client);
    return { ...pick(invoice, invoiceFields), lines: invoice.lines.map(line => pick(line, 'id description quantity unit_price discount_amount tax_rate tax_amount amount')),
      payments: invoice.payments.map(payment => pick(payment, 'id method amount date')) };
  });
}

export async function getPortalProfile(customerId) {
  const { rows: [user] } = await query(`SELECT ${profileFields} FROM users WHERE id=$1`, [customerId]);
  return user;
}

export async function updatePortalProfile(customerId, data) {
  const { rows: [user] } = await query(`UPDATE users SET name=$1,company=$2,phone=$3,address=$4 WHERE id=$5 RETURNING ${profileFields}`,
    [data.name, data.company, data.phone, data.address, customerId]);
  return user;
}
