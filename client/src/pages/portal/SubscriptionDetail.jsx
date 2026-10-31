import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, PageHeader, useToast } from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { api } from '../../lib/api';
import { date, money, PERIOD_LABEL, addDays } from '../../lib/format';
import Dialog from '../catalog/Dialog';
import { Control, FormError } from '../catalog/Editor';
import { LoadState } from './shared';

const labels = { accept: 'Accept quotation', pause: 'Pause subscription', resume: 'Resume subscription', renew: 'Renew subscription', close: 'Close subscription' };
const messages = {
  accept: 'Accept these products and terms? Your team will activate the subscription after acceptance.',
  pause: 'Pause this subscription? Billing stops while paused. Resuming keeps the pending billing date, so unbilled periods may be charged later.',
  resume: 'Resume this subscription? Billing continues from the pending billing date, including any unbilled periods.',
  close: 'Close this subscription? It cannot be reopened. Existing invoices and outstanding balances remain payable.',
  renew: 'Extend the expiry date under the current plan. Renewal keeps the current status and billing schedule.',
};

function ActionDialog({ record, action, onClose, onSaved, onRefresh }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const minExpiry = addDays(record.expiry_date > record.as_of ? record.expiry_date : record.as_of, 1);
  const [expiry, setExpiry] = useState(action === 'renew' ? minExpiry : '');
  async function save(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null);
    try {
      await api(`/portal/subscriptions/${record.id}/actions`, { method: 'POST', body: { action, ...(action === 'renew' ? { expiry_date: expiry } : {}) } });
      onSaved();
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={labels[action]} busy={busy} onClose={onClose}>
    <form className="stack" onSubmit={save} noValidate>
      <p>{messages[action]}</p><FormError error={error} />
      {action === 'renew' && <Control name="expiry_date" label="New expiry date" type="date" required min={minExpiry} value={expiry} onChange={setExpiry} errors={error?.fields} disabled={busy} hint={'Current expiry: ' + date(record.expiry_date)} />}
      <div className="form-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        {error?.status === 409 || error?.status === 404 ? <Button type="button" onClick={onRefresh}>Refresh subscription</Button> : <Button type="submit" variant={action === 'close' ? 'danger' : 'primary'} loading={busy}>{labels[action]}</Button>}
      </div>
    </form>
  </Dialog>;
}

function Details({ id }) {
  const state = useApi('/portal/subscriptions/' + id), toast = useToast();
  const [action, setAction] = useState(null), record = !state.loading && !state.error ? state.data : null;
  const expired = record?.expiry_date && record.expiry_date < record.as_of;
  const quoteExpired = record?.status === 'QUOTATION' && (!record.quotation_valid_until || record.quotation_valid_until < record.as_of || expired);
  const notice = record && (quoteExpired ? 'This quotation has expired. Contact your team for an updated quotation.' : expired && record.status !== 'CLOSED' ? 'This subscription has expired. Renew it if available, or contact your team.' : {
    QUOTATION: 'Review your products and terms, then accept your quotation to get started.', CONFIRMED: 'Quotation accepted. Your team will activate the subscription.',
    ACTIVE: 'Your subscription is active. Available controls follow your plan’s terms.', PAUSED: 'Your subscription is paused. Resuming keeps any pending billing periods.', CLOSED: 'This subscription is closed. Your invoice history remains available.',
  }[record.status]);
  return <div className="portal catalog subscriptions">
    <Link className="subscription-back" to="/portal">← My subscriptions</Link>
    <PageHeader title={record?.number || 'Subscription'} subtitle={record?.plan_name} actions={record && <Badge status={record.status} />} />
    <LoadState state={state}>{record && <>
      <section className="portal-next"><div><span className="portal-eyebrow">YOUR SUBSCRIPTION</span><h2>{record.plan_name}</h2><p>{notice}</p></div>
        <div className="row gap-sm wrap">{record.available_actions.map(value => <Button key={value} variant={value === 'close' ? 'danger' : value === 'accept' || value === 'resume' ? 'primary' : 'secondary'} onClick={() => setAction(value)}>{labels[value]}</Button>)}</div>
      </section>
      <div className="grid grid-2">
        <Card title="Dates and billing"><dl className="subscription-facts">
          <div><dt>Start date</dt><dd>{date(record.start_date)}</dd></div><div><dt>Expiry date</dt><dd>{record.expiry_date ? date(record.expiry_date) : 'No expiry'}</dd></div>
          {record.status === 'QUOTATION' && <div><dt>Quotation valid until</dt><dd>{date(record.quotation_valid_until)}</dd></div>}
          <div><dt>Next billing date</dt><dd>{['ACTIVE', 'PAUSED'].includes(record.status) ? date(record.next_billing_date) : '—'}{record.status === 'PAUSED' && <span className="catalog-cell-note">On hold while paused</span>}</dd></div>
          <div><dt>Payment terms</dt><dd>{record.payment_term_days} days from invoice</dd></div>
        </dl></Card>
        <Card title="Plan terms"><dl className="subscription-facts">
          <div><dt>Current plan fee</dt><dd>{money(record.plan_price)} / {PERIOD_LABEL[record.billing_period]}</dd></div>
          <div><dt>Pause</dt><dd>{record.pausable ? 'Allowed' : 'Unavailable'}</dd></div><div><dt>Early closure</dt><dd>{record.closable ? 'Allowed' : 'Unavailable'}</dd></div>
          <div><dt>Renewal</dt><dd>{record.renewable ? 'Allowed with an expiry date' : 'Unavailable'}</dd></div><div><dt>Subscription discount</dt><dd>{record.discount_name || 'None'}</dd></div>
        </dl></Card>
      </div>
      <Card title="Your products"><div className="table-wrap" tabIndex={0} role="region" aria-label="Subscription products"><table className="catalog-table">
        <thead><tr><th scope="col">Product</th><th scope="col" className="right">Quantity</th><th scope="col" className="right">Unit price</th><th scope="col" className="right">Subtotal</th></tr></thead>
        <tbody>{record.lines.map(line => <tr key={line.id}><td>{line.product_name}<span className="catalog-cell-note">{line.variant_value ? `${line.variant_attribute}: ${line.variant_value}` : 'Standard'}{line.tax_name && ' · ' + line.tax_name}</span></td><td className="right">{line.quantity}</td><td className="right">{money(line.unit_price)}</td><td className="right">{money(Math.round(Number(line.unit_price) * 100) * line.quantity / 100)}</td></tr>)}</tbody>
      </table></div><div className="subscription-subtotal"><span>Recurring base estimate</span><strong>{money((Math.round(Number(record.plan_price) * 100) + Math.round(Number(record.product_subtotal) * 100)) / 100)} / {PERIOD_LABEL[record.billing_period]}</strong></div>
        <p className="muted">Includes the current plan fee and saved product prices, before discounts, tax and any proration. Issued invoices show the final charges.</p>
      </Card>
      <Link className="btn btn-secondary" to={'/portal/invoices?subscription_id=' + record.id}>View invoices for this subscription</Link>
      {action && <ActionDialog record={record} action={action} onClose={() => setAction(null)} onSaved={() => { setAction(null); toast('Subscription updated'); state.reload(); }} onRefresh={() => { setAction(null); state.reload(); }} />}
    </>}</LoadState>
  </div>;
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  return <Details key={id} id={id} />;
}
