import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, PageHeader, Pagination, useToast } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useApi, useDebounced } from '../../lib/hooks';
import Dialog from '../catalog/Dialog';
import { Control, FormError, LoadState } from './Fields';
import TemplateEditor from './TemplateEditor';

function DeleteTemplate({ record, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function remove() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await api('/templates/' + record.id, { method: 'DELETE' }); onSaved(); }
    catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title="Delete template" busy={busy} onClose={onClose}>
    <FormError error={error} /><p>Delete <strong>{record.name}</strong>? Existing subscriptions keep their own products and quantities.</p>
    <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} onClick={remove}>Delete template</Button></div>
  </Dialog>;
}

export default function Templates() {
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [action, setAction] = useState(null);
  const delayed = useDebounced(search), toast = useToast();
  const state = useApi('/templates' + qs({ search: delayed, page, pageSize: 12 }));
  function saved(message) { setAction(null); toast(message); setPage(1); state.reload(); }
  return <div className="catalog subscriptions">
    <p className="catalog-eyebrow">SUBSCRIPTIONS</p>
    <PageHeader title="Quotation templates" subtitle="Reuse a plan and product selection for your next customer." actions={<Button onClick={() => setAction({ type: 'edit' })}>New template</Button>} />
    <Card>
      <Control name="template-search" label="Search templates" type="search" value={search} maxLength={200} onChange={v => { setSearch(v); setPage(1); }} />
      <LoadState state={state} retry={state.reload} />
      {!state.loading && !state.error && state.data && <>
        {!state.data.items.length ? <Empty>{search ? 'No templates match your search.' : 'Create a template to reuse your product selections.'}</Empty> : <div className="table-wrap" tabIndex={0} role="region" aria-label="Quotation templates table">
          <table className="catalog-table"><thead><tr><th scope="col">Template</th><th scope="col">Plan</th><th scope="col">Validity</th><th scope="col" className="right">Actions</th></tr></thead>
            <tbody>{state.data.items.map(row => <tr key={row.id}>
              <td><strong>{row.name}</strong><span className="catalog-cell-note">{row.line_count} product lines</span></td><td>{row.plan_name}</td><td>{row.validity_days} days</td>
              <td><div className="catalog-actions"><Link className="btn btn-primary" to={'/subscriptions/new?template=' + row.id} aria-label={`Use ${row.name}`}>Use template</Link><Button variant="secondary" onClick={() => setAction({ type: 'edit', record: row })} aria-label={`Edit ${row.name}`}>Edit</Button><Button variant="ghost" onClick={() => setAction({ type: 'delete', record: row })} aria-label={`Delete ${row.name}`}>Delete</Button></div></td>
            </tr>)}</tbody></table>
        </div>}
        <Pagination page={page} pageSize={12} total={state.data.total} onPage={setPage} />
      </>}
    </Card>
    {action?.type === 'edit' && <TemplateEditor id={action.record?.id} onClose={() => setAction(null)} onSaved={() => saved('Template saved')} />}
    {action?.type === 'delete' && <DeleteTemplate record={action.record} onClose={() => setAction(null)} onSaved={() => saved('Template deleted')} />}
  </div>;
}
