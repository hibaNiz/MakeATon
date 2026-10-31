import { HttpError } from '../../lib/errors.js';

export function invalid(field, message) {
  throw new HttpError(400, message, { [field]: message });
}

// Shared locks keep catalog edits from changing a selection halfway through a save.
export async function selectedPlan(client, id, startDate) {
  const { rows: [plan] } = await client.query('SELECT * FROM plans WHERE id=$1 FOR SHARE', [id]);
  if (!plan?.active) invalid('plan_id', 'Choose an active plan');
  if (startDate && ((plan.start_date && startDate < plan.start_date) || (plan.end_date && startDate > plan.end_date)))
    invalid('start_date', 'Start date must fall within the plan availability dates');
  return plan;
}

export async function selectedLines(client, lines, plan) {
  const ids = [...new Set(lines.map(line => line.product_id))].sort((a, b) => a - b);
  const products = await client.query('SELECT * FROM products WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE', [ids]);
  const variants = await client.query('SELECT * FROM product_variants WHERE product_id=ANY($1::int[]) ORDER BY id FOR SHARE', [ids]);
  const taxIds = [...new Set(products.rows.map(p => p.tax_id).filter(Boolean))].sort((a, b) => a - b);
  const taxes = await client.query('SELECT * FROM taxes WHERE id=ANY($1::int[]) ORDER BY id FOR SHARE', [taxIds]);
  const selected = lines.map((line, index) => {
    const product = products.rows.find(p => p.id === line.product_id);
    if (!product?.active) invalid(`lines.${index}.product_id`, 'Choose an active product');
    const variant = variants.rows.find(v => v.id === line.variant_id);
    if (line.variant_id && variant?.product_id !== product.id)
      invalid(`lines.${index}.variant_id`, 'Choose a variant belonging to this product');
    const tax = taxes.rows.find(t => t.id === product.tax_id);
    return { ...line, unit_price: (Math.round(product.sales_price * 100) + Math.round((variant?.extra_price || 0) * 100)) / 100,
      tax_id: tax?.active ? tax.id : null };
  });
  if (selected.reduce((sum, line) => sum + line.quantity, 0) < plan.min_quantity)
    invalid('lines', `This plan requires at least ${plan.min_quantity} units in total`);
  return selected;
}
