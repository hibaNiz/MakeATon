import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Empty, PageHeader, Pagination, useToast } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, money } from '../../lib/format';
import { Control, LoadState } from '../subscriptions/Fields';
import { RunBillingDialog } from './Dialogs';

export const InvoiceBadge = ({ invoice }) => invoice.is_overdue ? <Badge status="OVERDUE" /> : invoice.status === 'CONFIRMED' && Number(invoice.amount_paid) > 0 ? <Badge status="PARTIAL">Partly paid</Badge> : <Badge status={invoice.status} />;

export default function Invoices() {
  const [search, setSearch] = useState(''), [view, setView] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1);
  const delayed = useDebounced(search), toast = useToast();
  const [running, setRunning] = useState(false);
  const filter = view === 'OVERDUE' ? { overdue: 'true' } : view === 'UNPAID' ? { unpaid: 'true' } : view ? { status: view } : {};
  const rangeError = from && to && from > to ? 'The end date must be on or after the start date' : '';
  const state = useApi('/invoices' + qs({ search: delayed, ...filter, from, to: rangeError ? '' : to, page, pageSize: 12 }));
  const reset = set => value => { set(value); setPage(1); };
  async function confirmDrafts() {
    try { const r = await api('/invoices/confirm-drafts', { method: 'POST' }); toast(`${r.confirmed} draft invoices confirmed`); state.reload(); }
    catch (err) { toast(err.message, 'error'); }
  }
  return <div className="catalog subscriptions">
    <p className="catalog-eyebrow">BILLING</p>
    <PageHeader title="Invoices" subtitle="Follow what has been billed, what is paid and what is overdue." actions={<><Button variant="ghost" onClick={confirmDrafts}>Confirm all drafts</Button><Button onClick={() => setRunning(true)}>Run billing</Button></>} />
    <Card>
      <div className="catalog-filters">
        <Control name="invoice-search" label="Search invoices" type="search" maxLength={120} value={search} onChange={reset(setSearch)} placeholder="Invoice, subscription, customer name or email" />
        <Control name="invoice-view" label="Show" value={view} onChange={reset(setView)} options={[{ value: '', label: 'All invoices' }, { value: 'UNPAID', label: 'Awaiting payment' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'DRAFT', label: 'Draft' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
        <Control name="invoice-from" label="Invoiced from" type="date" value={from} onChange={reset(setFrom)} />
        <Control name="invoice-to" label="Invoiced until" type="date" value={to} onChange={reset(setTo)} errors={{ 'invoice-to': rangeError }} />
      </div>
      <LoadState state={state} retry={state.reload} />
      {!state.loading && !state.error && state.data && <>
        <p className="billing-summary"><span><strong>{state.data.total}</strong> invoices</span><span>Balance due on these: <strong>{money(state.data.balance)}</strong></span></p>
        {!state.data.items.length ? <Empty>{search || view || from || to ? 'No invoices match these filters.' : 'No invoices yet. Activate a subscription and run billing.'}</Empty> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Invoices table">
          <table className="catalog-table"><thead><tr><th scope="col">Invoice</th><th scope="col">Customer</th><th scope="col">Dates</th><th scope="col" className="right">Total</th><th scope="col" className="right">Balance</th><th scope="col">Status</th></tr></thead>
            <tbody>{state.data.items.map(row => <tr key={row.id}>
              <td><Link className="subscription-record-link" to={'/invoices/' + row.id}>{row.number}</Link><span className="catalog-cell-note">{row.subscription_number}</span></td>
              <td>{row.customer_name}{row.customer_company && <span className="catalog-cell-note">{row.customer_company}</span>}</td>
              <td>{date(row.invoice_date)}<span className="catalog-cell-note">Due {date(row.due_date)}</span></td>
              <td className="right">{money(row.total)}</td><td className="right">{row.status === 'CANCELLED' ? '—' : money(row.balance)}</td>
              <td><InvoiceBadge invoice={row} /></td>
            </tr>)}</tbody></table>
        </div>}
        <Pagination page={page} pageSize={12} total={state.data.total} onPage={setPage} />
      </>}
    </Card>
    {running && <RunBillingDialog onClose={() => setRunning(false)} onSaved={state.reload} />}
  </div>;
}
