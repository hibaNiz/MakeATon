import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, PageHeader, Pagination } from '../../components/ui';
import { qs } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import { date, title } from '../../lib/format';
import { Control, LoadState } from './Fields';

export default function Subscriptions() {
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1);
  const delayed = useDebounced(search);
  const state = useApi('/subscriptions' + qs({ search: delayed, status, page, pageSize: 12 }));
  return <div className="catalog subscriptions">
    <p className="catalog-eyebrow">SUBSCRIPTIONS</p>
    <PageHeader title="Subscriptions" subtitle="Prepare quotations and follow each customer’s subscription." actions={<><Link className="btn btn-secondary" to="/templates">Quotation templates</Link><Link className="btn btn-primary" to="/subscriptions/new">New subscription</Link></>} />
    <Card>
      <div className="catalog-filters">
        <Control name="subscription-search" label="Search subscriptions" type="search" maxLength={200} value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Number, customer name or email" />
        <Control name="subscription-status" label="Status" value={status} onChange={v => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All statuses' }, ...['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED'].map(value => ({ value, label: title(value) }))]} />
      </div>
      <LoadState state={state} retry={state.reload} />
      {!state.loading && !state.error && state.data && <>
        {!state.data.items.length ? <Empty>{search || status ? 'No subscriptions match these filters.' : 'Create your first subscription or start from a template.'}</Empty> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Subscriptions table">
          <table className="catalog-table"><thead><tr><th scope="col">Subscription</th><th scope="col">Customer</th><th scope="col">Plan</th><th scope="col">Dates</th><th scope="col">Status</th></tr></thead>
            <tbody>{state.data.items.map(row => <tr key={row.id}>
              <td><Link className="subscription-record-link" to={'/subscriptions/' + row.id}>{row.number}</Link></td><td>{row.customer_name}</td><td>{row.plan_name}</td>
              <td>{date(row.start_date)}<span className="catalog-cell-note">{row.expiry_date ? 'Until ' + date(row.expiry_date) : 'No expiry date'}</span></td><td><Badge status={row.status} /></td>
            </tr>)}</tbody></table>
        </div>}
        <Pagination page={page} pageSize={12} total={state.data.total} onPage={setPage} />
      </>}
    </Card>
  </div>;
}
