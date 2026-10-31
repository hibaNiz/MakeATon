import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, PageHeader, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { today, addDays } from '../../lib/format';
import { useOptions } from '../catalog/data';
import { Control, FormError, LoadState, PlanField, LineEditor, blankLine, copyLines } from './Fields';
import CustomerPicker from './CustomerPicker';

function initialDraft(record, template) {
  if (record) return { customer_id: record.customer_id, plan_id: record.plan_id, start_date: record.start_date, expiry_date: record.expiry_date || '', payment_term_days: record.payment_term_days, quotation_valid_until: record.quotation_valid_until || '', discount_id: record.discount_id || '', notes: record.notes || '', lines: copyLines(record.lines) };
  return { customer_id: '', plan_id: template?.plan_id || '', start_date: today(), expiry_date: '', payment_term_days: 15, quotation_valid_until: template ? addDays(today(), template.validity_days) : '', discount_id: '', notes: template?.notes || '', lines: template ? copyLines(template.lines) : [blankLine()] };
}

function DraftForm({ record, template }) {
  const [data, setData] = useState(() => initialDraft(record, template));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const products = useOptions('products'), plans = useOptions('plans'), discounts = useOptions('discounts');
  const loading = products.loading || plans.loading || discounts.loading;
  const referenceError = products.error || plans.error || discounts.error;
  const navigate = useNavigate(), toast = useToast();
  const change = (key, value) => setData(old => ({ ...old, [key]: value }));
  const control = (name, label, props = {}) => <Control name={name} label={label} value={data[name]} onChange={v => change(name, v)} errors={error?.fields} {...props} />;
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await api('/subscriptions' + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body: data });
      toast(record ? 'Draft updated' : 'Draft created'); navigate('/subscriptions/' + saved.id, { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  }
  return <>
    {template && <p className="alert alert-info">Starting from <strong>{template.name}</strong>. Changes here belong to this subscription.</p>}
    <Card>
      <form className="stack" onSubmit={save} noValidate>
        <FormError error={error} />
        {referenceError && <p role="alert" className="alert alert-error">{referenceError} Reload this page to retry loading the catalog.</p>}
        <fieldset className="catalog-fields stack" disabled={busy || loading || Boolean(referenceError)}>
          {loading && <p role="status">Loading catalog…</p>}
          <CustomerPicker value={data.customer_id} initialCustomer={record && { id: record.customer_id, name: record.customer_name, email: record.customer_email }} onChange={v => change('customer_id', v)} errors={error?.fields} />
          <PlanField plans={plans.items} value={data.plan_id} onChange={v => change('plan_id', v)} errors={error?.fields} />
          <div className="grid grid-2">
            {control('start_date', 'Start date', { type: 'date', min: '1900-01-01', required: true })}
            {control('expiry_date', 'Expiry date', { type: 'date', min: data.start_date, hint: 'Optional. The subscription is valid through this date.' })}
            {control('payment_term_days', 'Payment terms (days)', { type: 'number', min: 0, max: 365, step: 1, required: true })}
            {control('quotation_valid_until', 'Quotation valid until', { type: 'date', min: today(), max: data.expiry_date || undefined, hint: 'Optional until you issue the quotation.' })}
          </div>
          <LineEditor products={products.items} lines={data.lines} onChange={v => change('lines', v)} errors={error?.fields} />
          {control('discount_id', 'Subscription discount', { options: [{ value: '', label: 'No discount' }, ...discounts.items.filter(d => d.scope === 'SUBSCRIPTION').map(d => ({ value: d.id, label: d.name + (d.active ? '' : ' (archived)') }))], hint: 'Eligibility is checked against the start date, quantities and subtotal when saved.' })}
          {control('notes', 'Notes', { type: 'textarea', maxLength: 2000 })}
        </fieldset>
        <p className="alert alert-info">{record ? 'Saving replaces the draft’s product prices with current catalog prices.' : 'Saving captures current product prices for this draft.'}</p>
        <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => navigate(record ? '/subscriptions/' + record.id : '/subscriptions')}>Cancel</Button><Button loading={busy} disabled={loading || Boolean(referenceError)}>Save draft</Button></div>
      </form>
    </Card>
  </>;
}

function DraftLoader({ id, templateId }) {
  const state = useApi(id ? '/subscriptions/' + id : templateId ? '/templates/' + templateId : null);
  return <div className="catalog subscriptions">
    <Link className="subscription-back" to={id ? '/subscriptions/' + id : '/subscriptions'}>← Back to {id ? 'subscription' : 'subscriptions'}</Link>
    <PageHeader title={id ? 'Edit draft' : 'New subscription'} subtitle="Choose a customer, plan and products to prepare a quotation." />
    <LoadState state={state} retry={state.reload} />
    {!state.loading && !state.error && (id && state.data?.status !== 'DRAFT' ? <p role="alert" className="alert alert-info">Only drafts can be edited. Return to the subscription to see its current status.</p> : <DraftForm record={id ? state.data : null} template={templateId && !id ? state.data : null} />)}
  </div>;
}

export default function DraftEditor() {
  const { id } = useParams(), [params] = useSearchParams();
  const templateId = params.get('template');
  return <DraftLoader key={id || templateId || 'new'} id={id} templateId={templateId} />;
}
