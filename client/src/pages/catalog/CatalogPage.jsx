import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Badge, Button, Card, Empty, Loading, PageHeader, Pagination, useToast } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounced } from '../../lib/hooks';
import { money, title } from '../../lib/format';
import { catalog, useCatalogData } from './data';
import Editor, { Control, FormError } from './Editor';
import Dialog from './Dialog';
import PricePreview from './PricePreview';

function Summary({ kind, row }) {
  if (kind === 'products') return <><strong>{money(row.sales_price)}</strong><span className="catalog-cell-note">{row.variants.length} variants · {row.tax_name || 'No tax'}</span></>;
  if (kind === 'plans') return <><strong>{money(row.price)} / {{ DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[row.billing_period]}</strong><span className="catalog-cell-note">Min. {row.min_quantity} units · {row.pausable ? 'Pause allowed' : 'No pause'}</span></>;
  if (kind === 'taxes') return <strong>{row.rate}%</strong>;
  return <><strong>{row.type === 'PERCENTAGE' ? row.value + '%' : money(row.value)} off</strong><span className="catalog-cell-note">{row.scope === 'PRODUCT' ? `${row.product_ids.length} products` : 'Subscription'} · {row.used_count}{row.usage_limit ? '/' + row.usage_limit : ''} used</span></>;
}

function Confirmation({ action, kind, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const verb = action.type === 'delete' ? 'Delete' : action.record.active ? 'Archive' : 'Restore';
  async function confirm() {
    setBusy(true); setError(null);
    try {
      await api(`/${kind}/${action.record.id}`, { method: action.type === 'delete' ? 'DELETE' : 'PATCH', body: action.type === 'delete' ? undefined : { active: !action.record.active } });
      onSaved(action.type === 'delete' ? 'deleted' : action.record.active ? 'archived' : 'restored');
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={`${verb} ${catalog[kind].singular}`} onClose={onClose} busy={busy}>
    <FormError error={error} />
    <p>{verb} <strong>{action.record.name}</strong>?</p>
    <p className="muted">{action.type === 'delete' ? 'This permanently removes the record. Records referenced by subscriptions or templates cannot be deleted.' : action.record.active ? 'The record stays available for existing references. You can restore it at any time.' : 'This makes the record active again.'}</p>
    <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={action.type === 'delete' ? 'danger' : 'primary'} disabled={busy} loading={busy} onClick={confirm}>{verb}</Button></div>
  </Dialog>;
}

export default function CatalogPage({ kind }) {
  const config = catalog[kind], { user } = useAuth(), toast = useToast();
  const writable = kind !== 'discounts' || user.role === 'ADMIN';
  const [search, setSearch] = useState(''), [active, setActive] = useState('true'), [page, setPage] = useState(1);
  const [version, setVersion] = useState(0), [action, setAction] = useState(null);
  const delayedSearch = useDebounced(search);
  const state = useCatalogData('/' + kind + qs({ search: delayedSearch, active, page, pageSize: 12 }), version);
  const saved = (verb = 'saved') => { toast(`${title(config.singular)} ${verb}`); setAction(null); setPage(1); setVersion(v => v + 1); };
  return <div className="catalog">
    <p className="catalog-eyebrow">CATALOG</p>
    <PageHeader title={config.title} subtitle={config.description} actions={writable && <Button onClick={() => setAction({ type: 'edit', record: null })}>New {config.singular}</Button>} />
    <nav className="catalog-nav" aria-label="Catalog sections">{Object.entries(catalog).map(([key, item]) => <NavLink key={key} to={'/' + key}>{item.title}</NavLink>)}</nav>
    {kind === 'products' && <div className="catalog-tip"><strong>Make every price easy to explain.</strong><span>Use Preview on a product to check variant pricing, discount eligibility and tax.</span></div>}
    {!writable && <p className="alert alert-info">You can view discounts. Only admins can change them.</p>}
    <Card>
      <div className="catalog-filters">
        <Control name="search" label={`Search ${config.title.toLowerCase()}`} type="search" value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search by name" />
        <Control name="status" label="Status" value={active} onChange={v => { setActive(v); setPage(1); }} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Archived' }, { value: '', label: 'All records' }]} />
      </div>
      {state.loading ? <Loading /> : state.error ? <div role="alert"><p className="alert alert-error">{state.error}</p><Button variant="secondary" onClick={() => setVersion(v => v + 1)}>Retry</Button></div>
        : <>
          {!state.data.items.length ? <Empty>{search ? 'No records match your search.' : `No ${config.title.toLowerCase()} in this view.`}</Empty> :
            <div className="table-wrap" tabIndex={0} role="region" aria-label={`${config.title} table`}>
              <table className="catalog-table"><thead><tr><th scope="col">Name</th><th scope="col">{kind === 'taxes' ? 'Rate' : 'Pricing'}</th><th scope="col">Status</th><th scope="col" className="right">Actions</th></tr></thead>
                <tbody>{state.data.items.map(row => <tr key={row.id}>
                  <td><strong>{row.name}</strong><span className="catalog-cell-note">{kind === 'products' ? title(row.type) : kind === 'plans' || kind === 'discounts' ? `${row.start_date || 'Any date'} → ${row.end_date || 'No end date'}` : 'Product tax rate'}</span></td>
                  <td><Summary kind={kind} row={row} /></td>
                  <td><Badge status={row.active ? 'ACTIVE' : 'CLOSED'}>{row.active ? 'Active' : 'Archived'}</Badge></td>
                  <td><div className="catalog-actions">
                    {kind === 'products' && row.active && <Button variant="secondary" onClick={() => setAction({ type: 'preview', record: row })} aria-label={`Preview ${row.name}`}>Preview</Button>}
                    {writable ? <>
                      <Button variant="ghost" onClick={() => setAction({ type: 'edit', record: row })} aria-label={`Edit ${row.name}`}>Edit</Button>
                      <Button variant="ghost" onClick={() => setAction({ type: 'status', record: row })} aria-label={`${row.active ? 'Archive' : 'Restore'} ${row.name}`}>{row.active ? 'Archive' : 'Restore'}</Button>
                      {!row.active && <Button variant="danger" onClick={() => setAction({ type: 'delete', record: row })} aria-label={`Delete ${row.name}`}>Delete</Button>}
                    </> : <Button variant="ghost" onClick={() => setAction({ type: 'edit', record: row })} aria-label={`View ${row.name}`}>View</Button>}
                  </div></td>
                </tr>)}</tbody></table>
            </div>}
          <Pagination page={page} pageSize={12} total={state.data.total} onPage={setPage} />
        </>}
    </Card>
    {action?.type === 'edit' && <Editor kind={kind} record={action.record} readOnly={!writable} onClose={() => setAction(null)} onSaved={saved} />}
    {action?.type === 'preview' && <PricePreview product={action.record} onClose={() => setAction(null)} />}
    {(action?.type === 'status' || action?.type === 'delete') && <Confirmation action={action} kind={kind} onClose={() => setAction(null)} onSaved={saved} />}
  </div>;
}
