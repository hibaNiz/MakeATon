import { useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import Dialog from '../catalog/Dialog';
import { useOptions } from '../catalog/data';
import { Control, FormError, LoadState, PlanField, LineEditor, blankLine, copyLines } from './Fields';

function TemplateForm({ record, onSaved, onClose }) {
  const [data, setData] = useState(() => record ? { name: record.name, plan_id: record.plan_id, validity_days: record.validity_days, notes: record.notes || '', lines: copyLines(record.lines) } : { name: '', plan_id: '', validity_days: 30, notes: '', lines: [blankLine()] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const products = useOptions('products'), plans = useOptions('plans');
  const loading = products.loading || plans.loading, referenceError = products.error || plans.error;
  const change = (key, value) => setData(old => ({ ...old, [key]: value }));
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await api('/templates' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body: data }); onSaved(); }
    catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={record ? 'Edit quotation template' : 'New quotation template'} busy={busy} onClose={onClose}>
    <form className="stack" onSubmit={save} noValidate>
      <FormError error={error} />
      {referenceError && <p role="alert" className="alert alert-error">{referenceError} Close and reopen to retry.</p>}
      <fieldset className="catalog-fields stack" disabled={busy || loading || Boolean(referenceError)}>
        {loading && <p role="status">Loading catalog…</p>}
        <Control name="name" label="Template name" required maxLength={120} autoFocus value={data.name} errors={error?.fields} onChange={v => change('name', v)} />
        <div className="grid grid-2">
          <PlanField plans={plans.items} value={data.plan_id} onChange={v => change('plan_id', v)} errors={error?.fields} />
          <Control name="validity_days" label="Quotation validity (days)" type="number" min="1" max="365" step="1" required value={data.validity_days} errors={error?.fields} onChange={v => change('validity_days', v)} />
        </div>
        <LineEditor products={products.items} lines={data.lines} onChange={v => change('lines', v)} errors={error?.fields} />
        <Control name="notes" label="Notes" type="textarea" maxLength={2000} value={data.notes} errors={error?.fields} onChange={v => change('notes', v)} />
      </fieldset>
      <p className="muted">Templates store products and quantities. Each new draft uses the catalog prices at the time it is saved.</p>
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} disabled={loading || Boolean(referenceError)}>Save template</Button></div>
    </form>
  </Dialog>;
}

export default function TemplateEditor({ id, onSaved, onClose }) {
  const state = useApi(id ? '/templates/' + id : null);
  if (state.loading || state.error) return <Dialog title="Quotation template" onClose={onClose}><LoadState state={state} retry={state.reload} /></Dialog>;
  return <TemplateForm record={state.data} onSaved={onSaved} onClose={onClose} />;
}
