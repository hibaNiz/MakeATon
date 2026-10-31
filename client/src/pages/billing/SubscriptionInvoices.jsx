import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { InvoiceBadge } from './Invoices';

// Shown on the subscription page: its invoices, plus a button to bill the next period that has started.
export default function SubscriptionInvoices({ subscription, onBilled }) {
  const state = useApi('/invoices' + `?subscription_id=${subscription.id}&pageSize=12`), toast = useToast();
  const [busy, setBusy] = useState(false);
  const due = subscription.status === 'ACTIVE' && subscription.next_billing_date && subscription.next_billing_date <= new Date().toISOString().slice(0, 10)
    && (!subscription.expiry_date || subscription.next_billing_date <= subscription.expiry_date);
  async function create() {
    if (busy) return;
    setBusy(true);
    try { await api('/invoices', { method: 'POST', body: { subscription_id: subscription.id } }); toast('Invoice created'); await state.reload(); onBilled?.(); }
    catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  }
  return <Card title="Invoices" actions={due && <Button loading={busy} onClick={create}>Create next invoice</Button>}>
    {subscription.status === 'ACTIVE' && subscription.next_billing_date && <p className="muted">Next billing date: {date(subscription.next_billing_date)}{!due && ' (not started yet)'}</p>}
    {state.error && <p className="alert alert-error" role="alert">{state.error}</p>}
    {state.data && (!state.data.items.length ? <Empty>No invoices for this subscription yet.</Empty> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Subscription invoices table"><table className="catalog-table">
      <thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col" className="right">Total</th><th scope="col" className="right">Balance</th><th scope="col">Status</th></tr></thead>
      <tbody>{state.data.items.map(i => <tr key={i.id}><td><Link className="subscription-record-link" to={'/invoices/' + i.id}>{i.number}</Link></td><td>{date(i.invoice_date)}</td><td className="right">{money(i.total)}</td><td className="right">{i.status === 'CANCELLED' ? '—' : money(i.balance)}</td><td><InvoiceBadge invoice={i} /></td></tr>)}</tbody>
    </table></div>)}
  </Card>;
}
