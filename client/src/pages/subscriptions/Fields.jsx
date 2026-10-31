import { Button, Loading } from '../../components/ui';
import { money, PERIOD_LABEL } from '../../lib/format';
import { Control } from '../catalog/Editor';

export { Control, FormError } from '../catalog/Editor';

export function LoadState({ state, retry }) {
  if (state.loading) return <Loading />;
  if (state.error) return <div role="alert" className="stack"><p className="alert alert-error">{state.error}</p><Button variant="secondary" onClick={retry}>Retry</Button></div>;
  return null;
}

export const blankLine = () => ({ product_id: '', variant_id: '', quantity: 1 });
export const copyLines = lines => lines.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id: variant_id ?? '', quantity }));

export function PlanField({ plans, value, onChange, errors }) {
  const plan = plans.find(p => String(p.id) === String(value));
  return <Control name="plan_id" label="Recurring plan" value={value} onChange={onChange} errors={errors} required
    options={[{ value: '', label: 'Choose a plan' }, ...plans.map(p => ({ value: p.id, label: p.name + (p.active ? '' : ' (archived)') }))]}
    hint={plan ? `${money(plan.price)} / ${PERIOD_LABEL[plan.billing_period]} plan fee. Minimum ${plan.min_quantity} total units.${plan.active ? '' : ' Choose an active plan before saving.'}` : 'Create a plan in the catalog if none are available.'} />;
}

export function LineEditor({ lines, products, onChange, errors = {} }) {
  function update(index, change) { onChange(lines.map((line, i) => i === index ? { ...line, ...change } : line)); }
  return <fieldset className="catalog-rules subscription-lines" id="catalog-lines" tabIndex={-1} aria-describedby={errors.lines ? 'lines-error' : undefined}>
    <legend>Products and quantities</legend>
    <p className="muted">Prices come from the catalog when you save a draft. Combine quantities for repeated products and variants.</p>
    {errors.lines && <p id="lines-error" className="field-error">{errors.lines}</p>}
    {lines.map((line, index) => {
      const product = products.find(p => String(p.id) === String(line.product_id));
      const variant = product?.variants.find(v => String(v.id) === String(line.variant_id));
      return <div className="subscription-line" key={index}>
        <Control name={`lines.${index}.product_id`} label={`Product ${index + 1}`} value={line.product_id} errors={errors} required
          onChange={product_id => update(index, { product_id, variant_id: '' })}
          options={[{ value: '', label: 'Choose a product' }, ...products.map(p => ({ value: p.id, label: p.name + (p.active ? '' : ' (archived)') }))]} />
        <Control name={`lines.${index}.variant_id`} label={`Variant ${index + 1}`} value={line.variant_id} errors={errors}
          onChange={variant_id => update(index, { variant_id })} options={[{ value: '', label: 'Standard' }, ...(product?.variants || []).map(v => ({ value: v.id, label: `${v.attribute}: ${v.value} (+${money(v.extra_price)})` }))]} />
        <Control name={`lines.${index}.quantity`} label={`Quantity ${index + 1}`} type="number" min="1" max="10000" step="1" required value={line.quantity} errors={errors} onChange={quantity => update(index, { quantity })} />
        <Button variant="ghost" type="button" disabled={lines.length === 1} aria-label={`Remove product ${index + 1}`} onClick={() => onChange(lines.filter((_, i) => i !== index))}>Remove</Button>
        {product && <p className="subscription-line-price">Current unit price: {money((Math.round(Number(product.sales_price) * 100) + Math.round(Number(variant?.extra_price || 0) * 100)) / 100)}{!product.active && ' · Archived: choose an active product.'}</p>}
      </div>;
    })}
    <Button type="button" variant="secondary" disabled={lines.length >= 100} onClick={() => onChange([...lines, blankLine()])}>Add product</Button>
  </fieldset>;
}
