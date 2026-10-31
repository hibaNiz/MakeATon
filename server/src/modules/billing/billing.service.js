import { query, transaction } from '../../lib/db.js';
import { today } from '../../lib/dates.js';
import { HttpError } from '../../lib/errors.js';
import { billingWindow } from './schedule.js';
import { billingRunSchema } from './validation.js';
import { createPeriodInvoice } from './invoice.service.js';
import { recordId } from '../catalog/validation.js';

const pending = `(s.status='ACTIVE' AND s.next_billing_date <= $1
  AND (s.expiry_date IS NULL OR s.next_billing_date <= s.expiry_date))`;
const workDue = `(${pending} OR (s.status IN ('ACTIVE','PAUSED') AND p.auto_close
  AND s.expiry_date < $1 AND (s.status='PAUSED' OR s.next_billing_date IS NULL OR s.next_billing_date > s.expiry_date)))`;

async function processSubscription(client, subscription, currentDate, confirm) {
  const { rows: [plan] } = await client.query('SELECT * FROM plans WHERE id=$1 FOR SHARE', [subscription.plan_id]);
  const expired = subscription.expiry_date && subscription.expiry_date < currentDate;
  const billable = subscription.status === 'ACTIVE' && subscription.next_billing_date
    && subscription.next_billing_date <= currentDate
    && (!subscription.expiry_date || subscription.next_billing_date <= subscription.expiry_date);
  if (!billable) {
    if (expired && plan.auto_close) {
      await client.query("UPDATE subscriptions SET status='CLOSED',next_billing_date=NULL,updated_at=now() WHERE id=$1", [subscription.id]);
      return { closed: 1 };
    }
    return {};
  }
  const window = billingWindow(subscription, plan.billing_period);
  const invoice = await createPeriodInvoice(client, subscription, plan, window, currentDate, confirm);
  // An active subscription closes only after every period through expiry is saved.
  const close = expired && plan.auto_close && window.next_billing_date > subscription.expiry_date;
  await client.query('UPDATE subscriptions SET next_billing_date=$1,status=$2,updated_at=now() WHERE id=$3',
    [close ? null : window.next_billing_date, close ? 'CLOSED' : 'ACTIVE', subscription.id]);
  return { created: invoice.created ? 1 : 0, skipped: invoice.created ? 0 : 1,
    closed: close ? 1 : 0, invoice: invoice.created ? { id: invoice.id, number: invoice.number, subscription_id: subscription.id } : null };
}

// Manual draft creation uses the same locks, prices and cursor update as the runner.
export async function billNextPeriod(id) {
  const subscriptionId = recordId.parse(id), currentDate = today();
  return transaction(async client => {
    const { rows: [subscription] } = await client.query('SELECT * FROM subscriptions WHERE id=$1 FOR UPDATE', [subscriptionId]);
    if (!subscription) throw new HttpError(404, 'Subscription not found');
    if (subscription.status !== 'ACTIVE' || !subscription.next_billing_date
      || subscription.next_billing_date > currentDate
      || (subscription.expiry_date && subscription.next_billing_date > subscription.expiry_date))
      throw new HttpError(409, 'This subscription has no billing period due');
    const result = await processSubscription(client, subscription, currentDate, false);
    if (!result.created) throw new HttpError(409, 'This period already has an invoice');
    return result.invoice;
  });
}

// Each work item is one period or one expiry closure, with its own transaction.
// A bounded run leaves all unprocessed dates pending for the next run.
export async function runBilling(options = {}) {
  const { confirm, limit, subscription_id } = billingRunSchema.parse(options);
  const currentDate = today();
  const result = { created: 0, skipped: 0, closed: 0, processed: 0, invoices: [], errors: [], has_more: false };
  const failed = [];
  while (result.processed < limit) {
    let selectedId;
    try {
      const item = await transaction(async client => {
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='15s'");
        const { rows: [subscription] } = await client.query(`SELECT s.* FROM subscriptions s JOIN plans p ON p.id=s.plan_id
          WHERE ${workDue} AND ($2::int IS NULL OR s.id=$2) AND NOT (s.id=ANY($3::int[]))
          ORDER BY s.next_billing_date NULLS LAST,s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`, [currentDate, subscription_id ?? null, failed]);
        if (!subscription) return null;
        selectedId = subscription.id;
        return processSubscription(client, subscription, currentDate, confirm);
      });
      if (!item) break;
      result.created += item.created || 0;
      result.skipped += item.skipped || 0;
      result.closed += item.closed || 0;
      if (item.invoice) result.invoices.push(item.invoice);
    } catch (error) {
      if (!selectedId) throw error;
      failed.push(selectedId);
      result.errors.push({ subscription_id: selectedId,
        error: error instanceof HttpError ? error.message : 'Billing failed; this period remains pending' });
      if (!(error instanceof HttpError)) console.error(`Billing failed for subscription ${selectedId}:`, error.message);
    }
    result.processed++;
  }
  const remaining = await query(`SELECT EXISTS (SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id
    WHERE ${workDue} AND ($2::int IS NULL OR s.id=$2)) AS pending`, [currentDate, subscription_id ?? null]);
  result.has_more = remaining.rows[0].pending;
  return result;
}
