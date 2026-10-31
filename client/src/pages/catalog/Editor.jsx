import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { title } from '../../lib/format';
import Dialog from './Dialog';
import { catalog, formRecord, useOptions } from './data';

export function Control({ name, label, value, onChange, errors = {}, type = 'text', options, hint, ...props }) {
  const id = 'catalog-' + name, error = errors[name];
  const common = { id, name, value: value ?? '', onChange: e => onChange(e.target.value), 'aria-invalid': Boolean(error), 'aria-describedby': error || hint ? id + '-help' : undefined, className: 'input', ...props };
  return <div className={'field' + (error ? ' has-error' : '')}>
    <label className="field-label" htmlFor={id}>{label}</label>
    {options ? <select {...common}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : type === 'textarea' ? <textarea {...common} rows={3} /> : <input {...common} type={type} />}
    {(error || hint) && <span id={id + '-help'} className={error ? 'field-error' : 'field-hint'}>{error || hint}</span>}
  </div>;
}

export function FormError({ error }) {
  const ref = useRef(null);
  useEffect(() => { if (error) ref.current?.focus(); }, [error]);
  if (!error) return null;
  return <div ref={ref} tabIndex={-1} role="alert" className="alert alert-error">
    <strong>{error.message}</strong>
    {Object.keys(error.fields || {}).length > 0 && <ul>{Object.entries(error.fields).map(([key, message]) =>
      <li key={key}><a href={'#catalog-' + key} onClick={e => { e.preventDefault(); document.getElementById('catalog-' + key)?.focus(); }}>{message}</a></li>)}</ul>}
  </div>;
}

const choices = values => values.map(value => ({ value, label: title(value) }));

export default function Editor({ kind, record, readOnly = false, onClose, onSaved }) {
  const config = catalog[kind];
  const [data, setData] = useState(() => formRecord(kind, record));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const references = useOptions(kind === 'products' ? 'taxes' : kind === 'discounts' ? 'products' : null);
  const [productSearch, setProductSearch] = useState('');
  const change = (key, value) => setData(old => ({ ...old, [key]: value }));
  const control = (name, label, props = {}) => <Control name={name} label={label} value={data[name]} onChange={value => change(name, value)} errors={error?.fields} {...props} />;
  const money = (name, label, props = {}) => control(name, label, { type: 'number', min: 0, max: 99999999.99, step: '0.01', required: true, ...props });
  const dates = <div className="grid grid-2">{control('start_date', 'Available from', { type: 'date' })}{control('end_date', 'Available until', { type: 'date', min: data.start_date || undefined })}</div>;
  async function save(event) {
    event.preventDefault();
    if (busy || readOnly) return;
    setBusy(true); setError(null);
    try {
      await api('/' + kind + (record ? '/' + record.id : ''), { method: record ? 'PUT' : 'POST', body: data });
      onSaved();
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Dialog title={`${readOnly ? 'View' : record ? 'Edit' : 'New'} ${config.singular}`} onClose={onClose} busy={busy}>
    <form onSubmit={save} noValidate>
      <FormError error={error} />
      {references.error && <div role="alert" className="alert alert-error">{references.error} Close and reopen this form to retry.</div>}
      <fieldset className="catalog-fields stack" disabled={readOnly || busy || references.loading || Boolean(references.error)}>
        {references.loading && <Loading />}
        {control('name', 'Name', { required: true, maxLength: 120, autoFocus: true })}
        {kind === 'taxes' && money('rate', 'Tax rate (%)', { max: 100, hint: 'Use 0 for a zero-rated tax.' })}
        {kind === 'products' && <>
          <div className="grid grid-2">
            {control('type', 'Product type', { options: choices(['SOFTWARE', 'SERVICE', 'ADDON', 'GOODS']) })}
            {control('tax_id', 'Default tax', { options: [{ value: '', label: 'No tax' }, ...references.items.map(t => ({ value: t.id, label: `${t.name} (${t.rate}%)${t.active ? '' : ' — archived'}` }))] })}
            {money('sales_price', 'Sales price (INR)')}{money('cost_price', 'Cost price (INR)')}
          </div>
          {control('notes', 'Notes', { type: 'textarea', maxLength: 2000 })}
          <section className="catalog-variants" aria-labelledby="variants-heading">
            <div className="row gap wrap"><h3 id="variants-heading" className="grow">Variants</h3><Button type="button" variant="secondary" disabled={data.variants.length >= 100} onClick={() => change('variants', [...data.variants, { attribute: '', value: '', extra_price: 0 }])}>Add variant</Button></div>
            <p className="muted">Each variant adds to the sales price. For example: Brand / Odoo / INR 560.</p>
            {!data.variants.length && <p>No variants added. The base product can be sold on its own.</p>}
            {data.variants.map((v, i) => {
              const update = (key, value) => change('variants', data.variants.map((row, index) => index === i ? { ...row, [key]: value } : row));
              return <div key={v.id || 'new-' + i} className="catalog-variant">
                <Control name={`variants.${i}.attribute`} label={`Attribute ${i + 1}`} value={v.attribute} onChange={value => update('attribute', value)} errors={error?.fields} maxLength={120} />
                <Control name={`variants.${i}.value`} label={`Value ${i + 1}`} value={v.value} onChange={value => update('value', value)} errors={error?.fields} maxLength={120} />
                <Control name={`variants.${i}.extra_price`} label="Extra price (INR)" type="number" min={0} step="0.01" value={v.extra_price} onChange={value => update('extra_price', value)} errors={error?.fields} />
                <Button type="button" variant="danger" aria-label={`Remove variant ${i + 1}`} onClick={() => change('variants', data.variants.filter((_, index) => index !== i))}>Remove</Button>
              </div>;
            })}
          </section>
        </>}
        {kind === 'plans' && <>
          <div className="grid grid-2">{money('price', 'Base fee per period (INR)')}
            {control('billing_period', 'Billing period', { options: choices(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) })}
            {control('min_quantity', 'Minimum quantity', { type: 'number', min: 1, max: 10000, step: 1 })}
          </div>{dates}
          <fieldset className="catalog-rules"><legend>Subscription rules</legend><div className="grid grid-2">
            {Object.entries({ auto_close: 'Close at expiry', closable: 'Allow early closure', pausable: 'Allow pause', renewable: 'Allow renewal' }).map(([key, label]) => <Checkbox key={key} label={label} checked={data[key]} onChange={e => change(key, e.target.checked)} />)}
          </div></fieldset>
        </>}
        {kind === 'discounts' && <>
          <div className="grid grid-2">
            {control('type', 'Discount type', { options: choices(['PERCENTAGE', 'FIXED']) })}
            {money('value', data.type === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (INR)', { max: data.type === 'PERCENTAGE' ? 100 : 99999999.99, min: 0.01 })}
            <Control name="scope" label="Applies to" value={data.scope} errors={error?.fields} onChange={value => setData(old => ({ ...old, scope: value, product_ids: [] }))} options={choices(['PRODUCT', 'SUBSCRIPTION'])} />
            {control('usage_limit', 'Usage limit', { type: 'number', min: 1, max: 2147483647, placeholder: 'Unlimited', hint: record ? `Used ${record.used_count} times` : 'Leave empty for unlimited use.' })}
            {money('min_purchase', 'Minimum purchase (INR)', { required: false, placeholder: 'No minimum' })}
            {control('min_quantity', 'Minimum quantity', { type: 'number', min: 1, max: 10000, placeholder: 'No minimum' })}
          </div>{dates}
          {data.scope === 'PRODUCT' && <fieldset className="catalog-rules" id="catalog-product_ids" tabIndex={-1} aria-describedby={error?.fields?.product_ids ? 'products-error' : undefined}>
            <legend>Eligible products ({data.product_ids.length} selected)</legend>
            <Control name="product-search" label="Find a product" value={productSearch} onChange={setProductSearch} type="search" />
            <div className="catalog-product-options">{references.items.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p =>
              <Checkbox key={p.id} label={p.name + (p.active ? '' : ' — archived')} checked={data.product_ids.includes(p.id)} onChange={e => change('product_ids', e.target.checked ? [...data.product_ids, p.id] : data.product_ids.filter(id => id !== p.id))} />)}
              {!references.items.length && <p>Create a product first, or choose subscription scope.</p>}
            </div>
            {error?.fields?.product_ids && <span className="field-error" id="products-error">{error.fields.product_ids}</span>}
          </fieldset>}
        </>}
        <Checkbox label="Active" checked={data.active} onChange={e => change('active', e.target.checked)} />
      </fieldset>
      <div className="form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{readOnly ? 'Done' : 'Cancel'}</Button>
        {!readOnly && <Button type="submit" loading={busy} disabled={busy || references.loading || Boolean(references.error)}>Save {config.singular}</Button>}</div>
    </form>
  </Dialog>;
}
