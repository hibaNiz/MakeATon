import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, PageHeader, Pagination } from '../../components/ui';
import { qs } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, methodLabel, money } from '../../lib/format';
import { Control, LoadState } from '../subscriptions/Fields';
import { METHODS } from './RecordPaymentDialog';

export default function Payments() {
  const [search, setSearch] = useState(''), [method, setMethod] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1);
  const delayed = useDebounced(search);
  const rangeError = from && to && from > to ? 'The end date must be on or after the start date' : '';
  const state = useApi('/payments' + qs({ search: delayed, method, from, to: rangeError ? '' : to, page, pageSize: 12 }));
  const reset = set => value => { set(value); setPage(1); };
  return <div className="catalog subscriptions">
    <p className="catalog-eyebrow">BILLING</p>
    <PageHeader title="Payments" subtitle="Every payment received, by method and invoice. Record new payments from an invoice." />
    <Card>
      <div className="catalog-filters">
        <Control name="payment-search" label="Search payments" type="search" maxLength={120} value={search} onChange={reset(setSearch)} placeholder="Invoice, customer or note" />
        <Control name="payment-method" label="Method" value={method} onChange={reset(setMethod)} options={[{ value: '', label: 'All methods' }, ...METHODS]} />
        <Control name="payment-from" label="Paid from" type="date" value={from} onChange={reset(setFrom)} />
        <Control name="payment-to" label="Paid until" type="date" value={to} onChange={reset(setTo)} errors={{ 'payment-to': rangeError }} />
      </div>
      <LoadState state={state} retry={state.reload} />
      {!state.loading && !state.error && state.data && <>
        <p className="billing-summary"><span><strong>{state.data.total}</strong> payments</span><span>Total received: <strong>{money(state.data.sum)}</strong></span></p>
        {!state.data.items.length ? <Empty>{search || method || from || to ? 'No payments match these filters.' : 'No payments yet. Open a confirmed invoice to record one.'}</Empty> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Payments table">
          <table className="catalog-table"><thead><tr><th scope="col">Date</th><th scope="col">Invoice</th><th scope="col">Customer</th><th scope="col">Method</th><th scope="col">Recorded by</th><th scope="col" className="right">Amount</th></tr></thead>
            <tbody>{state.data.items.map(p => <tr key={p.id}>
              <td>{date(p.date)}{p.note && <span className="catalog-cell-note">{p.note}</span>}</td>
              <td><Link className="subscription-record-link" to={'/invoices/' + p.invoice_id}>{p.invoice_number}</Link></td>
              <td>{p.customer_name}</td><td>{methodLabel(p.method)}</td><td>{p.recorded_by_name || '—'}</td><td className="right">{money(p.amount)}</td>
            </tr>)}</tbody></table>
        </div>}
        <Pagination page={page} pageSize={12} total={state.data.total} onPage={setPage} />
      </>}
    </Card>
  </div>;
}
