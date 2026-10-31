import { useState } from 'react';
import { Button } from '../../components/ui';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import Dialog from './Dialog';
import { Control, FormError } from './Editor';
import { useOptions } from './data';

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

export default function PricePreview({ product, onClose }) {
  const [data, setData] = useState(() => ({ product_id: product.id, variant_id: '', quantity: 1, discount_id: '', date: today() }));
  const [result, setResult] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const discounts = useOptions('discounts');
  const update = (key, value) => { setData(old => ({ ...old, [key]: value })); setResult(null); setError(null); };
  async function preview(event) {
    event.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { setResult(await api('/catalog/price-preview', { method: 'POST', body: data })); }
    catch (err) { setError(err); }
    finally { setBusy(false); }
  }
  return <Dialog title="Price preview" onClose={onClose} busy={busy}>
    <p className="catalog-eyebrow">{product.name}</p>
    <p className="muted">See how a variant, discount and tax affect this product's price.</p>
    <form onSubmit={preview} noValidate>
      <FormError error={error} />
      {discounts.error && <div className="alert alert-error" role="alert">{discounts.error} Close and reopen to retry.</div>}
      <fieldset className="catalog-fields grid grid-2" disabled={busy}>
        <Control name="variant_id" label="Variant" value={data.variant_id} onChange={v => update('variant_id', v)} errors={error?.fields} options={[{ value: '', label: 'Base product' }, ...product.variants.map(v => ({ value: v.id, label: `${v.attribute}: ${v.value} (+${money(v.extra_price)})` }))]} />
        <Control name="quantity" label="Quantity" type="number" min={1} max={10000} value={data.quantity} onChange={v => update('quantity', v)} errors={error?.fields} />
        <Control name="discount_id" label="Discount" value={data.discount_id} onChange={v => update('discount_id', v)} errors={error?.fields} disabled={discounts.loading} options={[{ value: '', label: discounts.loading ? 'Loading discounts…' : 'No discount' }, ...discounts.items.map(d => ({ value: d.id, label: d.name }))]} />
        <Control name="date" label="Estimate date" type="date" value={data.date} onChange={v => update('date', v)} errors={error?.fields} />
      </fieldset>
      <div className="form-actions"><Button loading={busy} disabled={busy || discounts.loading || Boolean(discounts.error)}>Calculate price</Button></div>
    </form>
    <section aria-live="polite" aria-atomic="true">{result && <div className="catalog-estimate">
      {result.discount && <div className={'alert ' + (result.discount.eligible ? 'alert-info' : 'alert-error')}>
        <strong>{result.discount.name}: {result.discount.eligible ? 'applied' : 'not applied'}</strong>
        {result.discount.reasons.length > 0 && <ul>{result.discount.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      </div>}
      <dl className="catalog-breakdown">
        <div><dt>Base price</dt><dd>{money(result.base_price)}</dd></div>
        <div><dt>Variant addition</dt><dd>{money(result.variant_price)}</dd></div>
        <div><dt>{result.quantity} × {money(result.unit_price)}</dt><dd>{money(result.subtotal)}</dd></div>
        <div><dt>Discount</dt><dd>−{money(result.discount_amount)}</dd></div>
        <div><dt>Taxable amount</dt><dd>{money(result.taxable_amount)}</dd></div>
        <div><dt>Tax ({result.tax_rate}%)</dt><dd>{money(result.tax_amount)}</dd></div>
        <div className="catalog-total"><dt>Estimated total</dt><dd>{money(result.total)}</dd></div>
      </dl>
      <p className="muted">{result.notes.join(' ')} This preview does not use a discount redemption.</p>
    </div>}</section>
  </Dialog>;
}
