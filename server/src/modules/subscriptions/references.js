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

export function subtotalCents(lines, plan) {
  const total = lines.reduce((sum, line) => sum + BigInt(Math.round(line.unit_price * 100)) * BigInt(line.quantity),
    BigInt(Math.round(plan.price * 100)));
  if (total > 999999999999n) invalid('lines', 'The subscription subtotal cannot exceed INR 9,999,999,999.99');
  return total;
}

export async function selectedDiscount(client, id, lines, plan, startDate) {
  const subtotal = subtotalCents(lines, plan);
  if (!id) return;
  const { rows: [discount] } = await client.query('SELECT * FROM discounts WHERE id=$1 FOR SHARE', [id]);
  if (!discount?.active || discount.scope !== 'SUBSCRIPTION') invalid('discount_id', 'Choose an active subscription discount');
  if ((discount.start_date && startDate < discount.start_date) || (discount.end_date && startDate > discount.end_date))
    invalid('discount_id', 'Discount must be valid on the subscription start date');
  if (discount.usage_limit != null && discount.used_count >= discount.usage_limit)
    invalid('discount_id', 'Discount usage limit has been reached');
  if (discount.min_quantity && lines.reduce((sum, line) => sum + line.quantity, 0) < discount.min_quantity)
    invalid('discount_id', `Discount requires at least ${discount.min_quantity} units`);
  if (discount.min_purchase && subtotal < BigInt(Math.round(discount.min_purchase * 100)))
    invalid('discount_id', 'Subscription does not meet the discount minimum purchase');
}
