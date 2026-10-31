import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Field, Input, Select } from '../../components/ui';
import { title, date, money } from '../../lib/format';
import { qs } from '../../lib/api';
import { useApi } from '../../lib/hooks';

export function LoadState({ state, children }) {
  if (state.loading) return <div className="portal-empty" role="status"><span className="spinner dark" /> Loading your account…</div>;
  if (state.error) return <div className="portal-empty" role="alert"><h2>Couldn’t load this page</h2><p>{state.error}</p><Button variant="secondary" onClick={state.reload}>Try again</Button></div>;
  return children;
}

export function useListing(path, initial = {}) {
  const [filters, setFilters] = useState({ search: '', status: '', page: 1, pageSize: 12, ...initial });
  const state = useApi(path + qs(filters));
  return { ...state, filters, setFilters };
}

export function Filters({ state, statuses, label }) {
  const [search, setSearch] = useState(state.filters.search);
  const change = values => state.setFilters(old => ({ ...old, ...values, page: 1 }));
  return <form className="portal-filters" role="search" aria-label={label} onSubmit={e => { e.preventDefault(); change({ search: search.trim() }); }}>
    <Field label="Search"><Input type="search" value={search} maxLength={120} placeholder={label} onChange={e => setSearch(e.target.value)} /></Field>
    <Field label="Status"><Select aria-label="Status" value={state.filters.status} placeholder="All statuses" options={statuses.map(value => ({ value, label: title(value) }))} onChange={e => change({ status: e.target.value })} /></Field>
    <Button type="submit" variant="secondary">Search</Button>
    {(search || state.filters.status || state.filters.search) && <Button type="button" variant="ghost" onClick={() => { setSearch(''); change({ search: '', status: '' }); }}>Clear filters</Button>}
  </form>;
}

export function Empty({ title: heading, children }) {
  return <div className="portal-empty"><span className="portal-empty-mark" aria-hidden="true">○</span><h2>{heading}</h2><p>{children}</p></div>;
}

export function InvoiceRows({ items }) {
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="Your invoices"><table className="catalog-table">
    <thead><tr><th scope="col">Invoice</th><th scope="col">Status</th><th scope="col">Due date</th><th scope="col" className="right">Total</th><th scope="col" className="right">Balance due</th></tr></thead>
    <tbody>{items.map(invoice => <tr key={invoice.id}>
      <td><Link className="subscription-record-link" to={'/portal/invoices/' + invoice.id}>{invoice.number}</Link><span className="catalog-cell-note">{invoice.subscription_number}</span></td>
      <td><Badge status={invoice.status} />{invoice.is_overdue && <span className="catalog-cell-note portal-overdue">Overdue</span>}</td>
      <td>{date(invoice.due_date)}</td><td className="right">{money(invoice.total)}</td><td className="right">{invoice.status === 'CANCELLED' ? '—' : money(invoice.balance)}</td>
    </tr>)}</tbody>
  </table></div>;
}
