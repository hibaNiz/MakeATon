import { query, transaction } from '../../lib/db.js';
import { HttpError } from '../../lib/errors.js';
import { addDays, today } from '../../lib/dates.js';
import { invalid, selectedPlan, selectedLines, selectedDiscount } from './references.js';
import { getSubscription, lockSubscription } from './subscriptions.service.js';

const transitions = {
  quote: { from: ['DRAFT'], to: 'QUOTATION' }, confirm: { from: ['QUOTATION'], to: 'CONFIRMED' },
  activate: { from: ['CONFIRMED'], to: 'ACTIVE' }, pause: { from: ['ACTIVE'], to: 'PAUSED' },
  resume: { from: ['PAUSED'], to: 'ACTIVE' }, close: { from: ['QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED'], to: 'CLOSED' },
  revise: { from: ['QUOTATION'], to: 'DRAFT' }, renew: { from: ['ACTIVE', 'PAUSED'] },
};

// A locked row makes competing actions serial: the second request sees the first one's new state.
export async function transitionSubscription(id, data) {
  return transaction(async client => {
    const subscription = await lockSubscription(client, id);
    const rule = transitions[data.action];
    if (!rule?.from.includes(subscription.status))
      throw new HttpError(409, `Cannot ${data.action} a ${subscription.status.toLowerCase()} subscription`);
    const { rows: [plan] } = await client.query('SELECT * FROM plans WHERE id=$1 FOR SHARE', [subscription.plan_id]);
    const currentDate = today();
    const expired = subscription.expiry_date && subscription.expiry_date < currentDate;
    let validUntil = subscription.quotation_valid_until;
    let expiry = subscription.expiry_date;
    let nextBilling = subscription.next_billing_date;

    if (['quote', 'activate'].includes(data.action)) {
      await selectedPlan(client, subscription.plan_id, subscription.start_date);
      const { rows: lines } = await client.query('SELECT * FROM subscription_lines WHERE subscription_id=$1 ORDER BY id', [id]);
      if (!lines.length) invalid('lines', 'Add at least one product');
      await selectedLines(client, lines, plan);
      await selectedDiscount(client, subscription.discount_id, lines, plan, subscription.start_date);
      if (expired) invalid('expiry_date', 'The subscription has already expired');
    }
    if (data.action === 'quote') {
      validUntil = data.quotation_valid_until || validUntil || addDays(currentDate, 30);
      if (validUntil < currentDate) invalid('quotation_valid_until', 'Quotation validity cannot be in the past');
      if (expiry && validUntil > expiry) invalid('quotation_valid_until', 'Quotation validity cannot be after subscription expiry');
    }
    if (data.action === 'confirm' && (!validUntil || validUntil < currentDate || expired))
      throw new HttpError(409, 'This quotation has expired. Revise it before confirming');
    if (data.action === 'activate') nextBilling = subscription.start_date;
    if (data.action === 'pause' && !plan.pausable) throw new HttpError(409, 'This plan does not allow pausing');
    if (['pause', 'resume'].includes(data.action) && expired) throw new HttpError(409, 'Renew or close this expired subscription');
    // Keep the pending billing date while paused; resuming must never silently skip a period.
    if (data.action === 'close') {
      if (['ACTIVE', 'PAUSED'].includes(subscription.status) && !plan.closable && !expired)
        throw new HttpError(409, 'This plan does not allow closing before expiry');
      nextBilling = null;
    }
    if (data.action === 'revise') validUntil = null;
    if (data.action === 'renew') {
      if (!plan.renewable) throw new HttpError(409, 'This plan does not allow renewal');
      if (!expiry) throw new HttpError(409, 'This subscription has no expiry date to extend');
      if (data.expiry_date <= expiry || data.expiry_date <= currentDate)
        invalid('expiry_date', 'Choose an expiry after both the current expiry and today');
      expiry = data.expiry_date;
    }
    await client.query(`UPDATE subscriptions SET status=$1,quotation_valid_until=$2,expiry_date=$3,
      next_billing_date=$4,updated_at=now() WHERE id=$5`, [rule.to || subscription.status, validUntil, expiry, nextBilling, id]);
    return getSubscription(id, client);
  });
}

// Subscription-only maintenance. Leave active billing backlogs for the engine.
// Expiry is inclusive: a subscription remains valid through the expiry date.
export async function closeExpiredSubscriptions() {
  const result = await query(`UPDATE subscriptions s SET status='CLOSED',next_billing_date=NULL,updated_at=now()
    FROM plans p WHERE p.id=s.plan_id AND p.auto_close=true
    AND s.status IN ('ACTIVE','PAUSED') AND s.expiry_date < $1
    AND (s.status='PAUSED' OR s.next_billing_date IS NULL OR s.next_billing_date > s.expiry_date)
    RETURNING s.id`, [today()]);
  return { closed: result.rowCount };
}
