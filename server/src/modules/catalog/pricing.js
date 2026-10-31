const cents = value => BigInt(Math.round(Number(value) * 100));
const money = value => Number(value) / 100;
const percentage = (value, rate) => (value * cents(rate) + 5000n) / 10000n;

// One product line, one optional product discount. Rounds half-up to paise.
// This is an estimate; it neither creates an invoice nor consumes a discount.
export function priceProduct({ product, variant, tax, discount, quantity, date }) {
  const unit = cents(product.sales_price) + cents(variant?.extra_price || 0);
  const subtotal = unit * BigInt(quantity);
  const reasons = [];
  if (discount) {
    if (!discount.active) reasons.push('Discount is archived.');
    if (discount.scope !== 'PRODUCT') reasons.push('Subscription discounts apply to a full subscription, not this product estimate.');
    else if (!discount.product_ids.includes(product.id)) reasons.push('Discount does not include this product.');
    if (discount.start_date && date < discount.start_date) reasons.push('Discount has not started yet.');
    if (discount.end_date && date > discount.end_date) reasons.push('Discount has expired.');
    if (discount.min_quantity && quantity < discount.min_quantity) reasons.push(`Requires at least ${discount.min_quantity} units.`);
    if (discount.min_purchase && subtotal < cents(discount.min_purchase)) reasons.push(`Minimum purchase is INR ${Number(discount.min_purchase).toFixed(2)} before tax.`);
    if (discount.usage_limit != null && discount.used_count >= discount.usage_limit) reasons.push('Discount usage limit has been reached.');
  }
  let reduction = 0n;
  if (discount && !reasons.length) {
    reduction = discount.type === 'PERCENTAGE' ? percentage(subtotal, discount.value) : cents(discount.value);
    if (reduction > subtotal) reduction = subtotal;
  }
  const taxable = subtotal - reduction;
  const rate = tax?.active ? tax.rate : 0;
  const taxAmount = percentage(taxable, rate);
  return {
    date, quantity, product_name: product.name,
    variant_name: variant ? `${variant.attribute}: ${variant.value}` : null,
    base_price: Number(product.sales_price), variant_price: Number(variant?.extra_price || 0),
    unit_price: money(unit), subtotal: money(subtotal), discount_amount: money(reduction),
    taxable_amount: money(taxable), tax_rate: Number(rate), tax_amount: money(taxAmount), total: money(taxable + taxAmount),
    discount: discount ? { name: discount.name, eligible: !reasons.length, reasons } : null,
    notes: [tax && !tax.active ? 'The assigned tax is archived; no tax is applied.' : 'Tax is calculated after the discount.', 'Product estimate only. Plan fees and subscription discounts are excluded.'],
  };
}
