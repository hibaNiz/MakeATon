import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, PageHeader, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../lib/auth';
import { date, methodLabel, money } from '../../lib/format';
import { LoadState } from '../subscriptions/Fields';
import { InvoiceBadge } from './Invoices';
import { InvoiceActionDialog } from './Dialogs';
import { RecordPaymentDialog } from '../payments/RecordPaymentDialog';

function Details({ id }) {
  const state = useApi('/invoices/' + id), invoice = state.data, toast = useToast();
  const [dialog, setDialog] = useState(null), [removing, setRemoving] = useState(null);
  async function removePayment(payment) {
    if (removing) return;
    if (!window.confirm(`Remove the ${money(payment.amount)} payment? The invoice balance will be restored.`)) return;
    setRemoving(payment.id);
    try { await api('/payments/' + payment.id, { method: 'DELETE' }); toast('Payment removed'); await state.reload(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setRemoving(null); }
  }
  const afterAction = (result, action) => { setDialog(null); state.setData(result); toast(action === 'send' ? 'Invoice sent' : action === 'cancel' ? 'Invoice cancelled' : 'Invoice confirmed'); };
  const canPay = invoice?.status === 'CONFIRMED' && Number(invoice.balance) > 0;
  const isAdmin = useAuth().user?.role === 'ADMIN';
  return <div className="catalog subscriptions">
    <Link className="subscription-back no-print" to="/invoices">← All invoices</Link>
    <LoadState state={state} retry={state.reload} />
    {!state.loading && !state.error && invoice && <>
      <PageHeader title={invoice.number} subtitle={`${invoice.customer_name} · for ${date(invoice.period_start)} to ${date(invoice.period_end)}`} actions={<><InvoiceBadge invoice={invoice} />
        <div className="row gap-sm wrap no-print">
          {canPay && <Button onClick={() => setDialog('pay')}>Record payment</Button>}
          {invoice.status === 'DRAFT' && <Button onClick={() => setDialog('confirm')}>Confirm invoice</Button>}
          {['CONFIRMED', 'PAID'].includes(invoice.status) && <Button variant="secondary" onClick={() => setDialog('send')}>{invoice.sent_at ? 'Send again' : 'Send to customer'}</Button>}
          {invoice.status !== 'CANCELLED' && <Button variant="secondary" onClick={() => window.print()}>Print</Button>}
          {['DRAFT', 'CONFIRMED'].includes(invoice.status) && Number(invoice.amount_paid) === 0 && <Button variant="danger" onClick={() => setDialog('cancel')}>Cancel invoice</Button>}
        </div></>} />
      {invoice.is_overdue && <p className="alert alert-error" role="alert">This invoice was due on {date(invoice.due_date)} and {money(invoice.balance)} is still unpaid.</p>}
      <div className="grid grid-2">
        <Card title="Bill to"><dl className="subscription-facts">
          <div><dt>Customer</dt><dd>{invoice.customer_name}<span className="catalog-cell-note">{invoice.customer_email}</span></dd></div>
          {invoice.customer_company && <div><dt>Company</dt><dd>{invoice.customer_company}</dd></div>}
          {invoice.customer_address && <div><dt>Address</dt><dd>{invoice.customer_address}</dd></div>}
          <div><dt>Subscription</dt><dd><Link className="subscription-record-link" to={'/subscriptions/' + invoice.subscription_id}>{invoice.subscription_number}</Link></dd></div>
        </dl></Card>
        <Card title="Invoice"><dl className="subscription-facts">
          <div><dt>Invoice date</dt><dd>{date(invoice.invoice_date)}</dd></div>
          <div><dt>Due date</dt><dd>{date(invoice.due_date)}</dd></div>
          <div><dt>Billing period</dt><dd>{date(invoice.period_start)} – {date(invoice.period_end)}</dd></div>
          <div><dt>Emailed</dt><dd>{invoice.sent_at ? date(invoice.sent_at) : 'Not sent'}</dd></div>
        </dl></Card>
      </div>
      <Card title="Items">
        {invoice.billable_days < invoice.period_days && <p className="alert alert-info">Charges are prorated for {invoice.billable_days} of {invoice.period_days} days. Unit prices show the full recurring rate.</p>}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Invoice items table"><table className="catalog-table">
          <thead><tr><th scope="col">Description</th><th scope="col" className="right">Qty</th><th scope="col" className="right">Unit price</th><th scope="col" className="right">Discount</th><th scope="col" className="right">Tax</th><th scope="col" className="right">Amount</th></tr></thead>
          <tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.description}</td><td className="right">{line.quantity}</td><td className="right">{money(line.unit_price)}</td><td className="right">{Number(line.discount_amount) ? '−' + money(line.discount_amount) : '—'}</td><td className="right">{Number(line.tax_rate) ? `${money(line.tax_amount)} (${Number(line.tax_rate)}%)` : '—'}</td><td className="right">{money(line.amount)}</td></tr>)}</tbody>
        </table></div>
        <div className="billing-totals">
          <div><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
          {Number(invoice.discount_total) > 0 && <div><span>Discounts</span><span>−{money(invoice.discount_total)}</span></div>}
          <div><span>Tax</span><span>{money(invoice.tax_total)}</span></div>
          <div className="grand"><span>Total</span><span>{money(invoice.total)}</span></div>
          <div><span>Paid</span><span>{money(invoice.amount_paid)}</span></div>
          <div><strong>Balance due</strong><strong>{invoice.status === 'CANCELLED' ? '—' : money(invoice.balance)}</strong></div>
        </div>
      </Card>
      <Card title="Payments">
        {!invoice.payments.length ? <p className="muted">No payments recorded yet.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Payments table"><table className="catalog-table">
          <thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col">Recorded by</th><th scope="col" className="right">Amount</th>{isAdmin && <th scope="col" className="no-print">Actions</th>}</tr></thead>
          <tbody>{invoice.payments.map(p => <tr key={p.id}><td>{date(p.date)}{p.note && <span className="catalog-cell-note">{p.note}</span>}</td><td>{methodLabel(p.method)}</td><td>{p.recorded_by_name || '—'}</td><td className="right">{money(p.amount)}</td>{isAdmin && <td className="no-print"><Button size="sm" variant="ghost" disabled={!!removing} loading={removing === p.id} onClick={() => removePayment(p)}>Remove</Button></td>}</tr>)}</tbody>
        </table></div>}
      </Card>
      {dialog === 'pay' && <RecordPaymentDialog invoice={invoice} onClose={() => setDialog(null)} onSaved={message => { setDialog(null); toast(message); state.reload(); }} />}
      {['confirm', 'cancel', 'send'].includes(dialog) && <InvoiceActionDialog action={dialog} invoice={invoice} onClose={() => setDialog(null)} onSaved={afterAction} />}
    </>}
  </div>;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  return <Details key={id} id={id} />;
}
