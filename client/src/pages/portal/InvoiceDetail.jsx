import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, PageHeader } from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { date, money, methodLabel } from '../../lib/format';
import { LoadState } from './shared';

function Details({ id }) {
  const state = useApi('/portal/invoices/' + id), invoice = !state.loading && !state.error ? state.data : null;
  return <div className="portal catalog subscriptions portal-invoice">
    <Link className="subscription-back" to="/portal/invoices">← My invoices</Link>
    <PageHeader title={invoice?.number || 'Invoice'} subtitle="Your invoice and payment history" actions={invoice && <><Badge status={invoice.status} /><Button variant="secondary" onClick={() => window.print()}>Print invoice</Button></>} />
    <LoadState state={state}>{invoice && <>
      <section className={'portal-balance' + (invoice.is_overdue ? ' portal-balance-overdue' : '')}>
        <div><span>{invoice.status === 'CANCELLED' ? 'Cancelled invoice' : invoice.status === 'PAID' ? 'Paid in full' : 'Balance due'}</span><strong>{invoice.status === 'CANCELLED' ? 'No payment due' : money(invoice.balance)}</strong></div>
        <p>{invoice.status === 'CANCELLED' ? 'This invoice has been cancelled.' : invoice.status === 'PAID' ? 'All payments for this invoice have been recorded.' : `${invoice.is_overdue ? 'Overdue since' : 'Due by'} ${date(invoice.due_date)}. Contact your team to arrange payment.`}</p>
      </section>
      <div className="grid grid-2">
        <Card title="Bill to"><dl className="subscription-facts">
          <div><dt>Customer</dt><dd>{invoice.customer_name}<span className="catalog-cell-note">{invoice.customer_email}</span></dd></div>
          {invoice.customer_company && <div><dt>Company</dt><dd>{invoice.customer_company}</dd></div>}
          {invoice.customer_address && <div><dt>Address</dt><dd className="portal-address">{invoice.customer_address}</dd></div>}
          <div><dt>Subscription</dt><dd><Link className="subscription-record-link" to={'/portal/subscriptions/' + invoice.subscription_id}>{invoice.subscription_number}</Link></dd></div>
        </dl></Card>
        <Card title="Invoice details"><dl className="subscription-facts">
          <div><dt>Invoice date</dt><dd>{date(invoice.invoice_date)}</dd></div><div><dt>Due date</dt><dd>{date(invoice.due_date)}</dd></div>
          <div><dt>Billing period</dt><dd>{date(invoice.period_start)} – {date(invoice.period_end)}</dd></div>
        </dl></Card>
      </div>
      <Card title="Items">
        {invoice.billable_days < invoice.period_days && <p className="alert alert-info">Charges are prorated for {invoice.billable_days} of {invoice.period_days} days. Unit prices show the full recurring rate.</p>}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Invoice items"><table className="catalog-table">
          <thead><tr><th scope="col">Description</th><th scope="col" className="right">Qty</th><th scope="col" className="right">Unit price</th><th scope="col" className="right">Discount</th><th scope="col" className="right">Tax</th><th scope="col" className="right">Amount</th></tr></thead>
          <tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.description}</td><td className="right">{line.quantity}</td><td className="right">{money(line.unit_price)}</td><td className="right">{money(line.discount_amount)}</td><td className="right">{money(line.tax_amount)}{Number(line.tax_rate) > 0 && <span className="catalog-cell-note">{Number(line.tax_rate)}%</span>}</td><td className="right">{money(line.amount)}</td></tr>)}</tbody>
        </table></div>
        <dl className="portal-totals"><div><dt>Subtotal</dt><dd>{money(invoice.subtotal)}</dd></div><div><dt>Discounts</dt><dd>−{money(invoice.discount_total)}</dd></div><div><dt>Tax</dt><dd>{money(invoice.tax_total)}</dd></div><div className="portal-total"><dt>Total</dt><dd>{money(invoice.total)}</dd></div><div><dt>Paid</dt><dd>{money(invoice.amount_paid)}</dd></div><div><dt>Balance due</dt><dd>{invoice.status === 'CANCELLED' ? '—' : money(invoice.balance)}</dd></div></dl>
      </Card>
      <Card title="Payment history">{!invoice.payments.length ? <p className="muted">No payments recorded yet.</p> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Payment history"><table className="catalog-table">
        <thead><tr><th scope="col">Date</th><th scope="col">Method</th><th scope="col" className="right">Amount</th></tr></thead>
        <tbody>{invoice.payments.map(payment => <tr key={payment.id}><td>{date(payment.date)}</td><td>{methodLabel(payment.method)}</td><td className="right">{money(payment.amount)}</td></tr>)}</tbody>
      </table></div>}</Card>
    </>}</LoadState>
  </div>;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  return <Details key={id} id={id} />;
}
