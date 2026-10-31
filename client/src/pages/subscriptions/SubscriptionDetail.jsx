import { Link, useParams } from 'react-router-dom';
import { Badge, Card, PageHeader, StatusSteps } from '../../components/ui';
import { useApi } from '../../lib/hooks';
import { date, money, PERIOD_LABEL } from '../../lib/format';
import { LoadState } from './Fields';

function Details({ id }) {
  const state = useApi('/subscriptions/' + id), record = state.data;
  return <div className="catalog subscriptions">
    <Link className="subscription-back" to="/subscriptions">← All subscriptions</Link>
    <LoadState state={state} retry={state.reload} />
    {!state.loading && !state.error && record && <>
      <PageHeader title={record.number} subtitle={`${record.customer_name} · ${record.plan_name}`} actions={<><Badge status={record.status} />{record.status === 'DRAFT' && <Link className="btn btn-primary" to={'/subscriptions/' + id + '/edit'}>Edit draft</Link>}</>} />
      <StatusSteps status={record.status} />
      <div className="grid grid-2">
        <Card title="Customer and dates"><dl className="subscription-facts">
          <div><dt>Customer</dt><dd>{record.customer_name}<span className="catalog-cell-note">{record.customer_email}</span></dd></div>
          <div><dt>Start date</dt><dd>{date(record.start_date)}</dd></div>
          <div><dt>Expiry date</dt><dd>{record.expiry_date ? date(record.expiry_date) : 'No expiry'}</dd></div>
          <div><dt>Quotation valid until</dt><dd>{date(record.quotation_valid_until)}</dd></div>
          <div><dt>Payment terms</dt><dd>{record.payment_term_days} days</dd></div>
        </dl></Card>
        <Card title="Plan and terms"><dl className="subscription-facts">
          <div><dt>Plan</dt><dd>{record.plan_name}</dd></div>
          <div><dt>Current plan fee</dt><dd>{money(record.plan_price)} / {PERIOD_LABEL[record.billing_period]}</dd></div>
          <div><dt>Minimum quantity</dt><dd>{record.min_quantity} units</dd></div>
          <div><dt>Pause / early close / renew</dt><dd>{[record.pausable, record.closable, record.renewable].map(v => v ? 'Allowed' : 'Unavailable').join(' / ')}</dd></div>
          <div><dt>Subscription discount</dt><dd>{record.discount_name || 'None'}</dd></div>
        </dl></Card>
      </div>
      <Card title="Products">
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Subscription products table"><table className="catalog-table">
          <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col" className="right">Saved unit price</th><th scope="col">Tax reference</th><th scope="col" className="right">Subtotal</th></tr></thead>
          <tbody>{record.lines.map(line => <tr key={line.id}><td>{line.product_name}<span className="catalog-cell-note">{line.variant_value ? `${line.variant_attribute}: ${line.variant_value}` : 'Standard'}</span></td><td>{line.quantity}</td><td className="right">{money(line.unit_price)}</td><td>{line.tax_name || 'No tax'}</td><td className="right">{money(Math.round(Number(line.unit_price) * 100) * line.quantity / 100)}</td></tr>)}</tbody>
        </table></div>
        <div className="subscription-subtotal"><span>Product subtotal</span><strong>{money(record.product_subtotal)}</strong></div>
        <p className="muted">Before plan fees, discounts and tax. Product prices were captured when this draft was saved.</p>
      </Card>
      {record.notes && <Card title="Notes"><p className="subscription-notes">{record.notes}</p></Card>}
    </>}
  </div>;
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  return <Details key={id} id={id} />;
}
