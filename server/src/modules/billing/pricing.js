import { HttpError } from '../../lib/errors.js';

const cents = value => BigInt(Math.round(Number(value) * 100));
const rounded = (numerator, denominator) => (numerator + denominator / 2n) / denominator;
const percentage = (value, rate) => rounded(value * cents(rate), 10000n);
const sum = values => values.reduce((total, value) => total + value, 0n);
const money = value => {
  if (value < 0n || value > 999999999999n) throw new HttpError(409, 'Invoice amount exceeds the supported limit');
  return Number(value) / 100;
};

function eligible(discount, quantity, subtotal, date) {
  return discount.active && (!discount.start_date || date >= discount.start_date)
    && (!discount.end_date || date <= discount.end_date)
    && (!discount.min_quantity || quantity >= discount.min_quantity)
    && (!discount.min_purchase || subtotal >= cents(discount.min_purchase))
    && (discount.usage_limit == null || discount.used_count < discount.usage_limit);
}

// Allocate whole paise proportionally; largest remainders get the spare paise.
function allocate(total, weights) {
  const basis = sum(weights);
  if (!basis) return weights.map(() => 0n);
  const shares = weights.map(weight => total * weight / basis);
  const order = weights.map((weight, index) => ({ index, remainder: total * weight % basis }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remainder = Number(total - sum(shares));
  for (let i = 0; i < remainder; i++) shares[order[i].index]++;
  return shares;
}

// Prices are saved subscription prices. Prorate each extended line once, then
// discount, then tax. The plan fee has no tax reference in the catalog schema.
export function priceInvoice({ plan, lines, discounts = [], discount_id, date, billable_days = 1, period_days = 1 }) {
  if (!Number.isInteger(billable_days) || !Number.isInteger(period_days)
    || billable_days < 1 || period_days < billable_days)
    throw new HttpError(409, 'Invalid invoice proration');
  if (!lines.length) throw new HttpError(409, 'Subscription has no product lines');
  const prorate = value => rounded(value * BigInt(billable_days), BigInt(period_days));
  const reduction = (discount, subtotal) => {
    const amount = discount.type === 'PERCENTAGE' ? percentage(subtotal, discount.value) : prorate(cents(discount.value));
    return amount < subtotal ? amount : subtotal;
  };
  const applied = new Set();
  const priced = [{ description: plan.name, quantity: 1, unit_price: Number(plan.price), tax_rate: 0,
    subtotal: prorate(cents(plan.price)), discount: 0n }];
  for (const line of lines) {
    const subtotal = prorate(cents(line.unit_price) * BigInt(line.quantity));
    let best = null, savings = 0n;
    for (const discount of discounts) {
      if (discount.scope !== 'PRODUCT' || !discount.product_ids.includes(line.product_id)
        || !eligible(discount, line.quantity, subtotal, date)) continue;
      const amount = reduction(discount, subtotal);
      if (amount > savings || (amount === savings && amount > 0n && discount.id < best.id)) {
        best = discount; savings = amount;
      }
    }
    if (best) applied.add(best.id);
    priced.push({ description: line.product_name + (line.variant_value ? ` (${line.variant_attribute}: ${line.variant_value})` : ''),
      quantity: line.quantity, unit_price: Number(line.unit_price),
      tax_rate: line.tax_active ? Number(line.tax_rate) : 0, subtotal, discount: savings });
  }
  const subtotal = sum(priced.map(line => line.subtotal));
  const discount = discounts.find(item => item.id === discount_id && item.scope === 'SUBSCRIPTION');
  if (discount && eligible(discount, lines.reduce((qty, line) => qty + line.quantity, 0), subtotal, date)) {
    const remaining = priced.map(line => line.subtotal - line.discount);
    const amount = reduction(discount, sum(remaining));
    if (amount > 0n) {
      const allocated = allocate(amount, remaining);
      priced.forEach((line, index) => { line.discount += allocated[index]; });
      applied.add(discount.id);
    }
  }
  for (const line of priced) {
    line.tax = percentage(line.subtotal - line.discount, line.tax_rate);
    line.amount = line.subtotal - line.discount + line.tax;
  }
  return { subtotal: money(subtotal), discount_total: money(sum(priced.map(line => line.discount))),
    tax_total: money(sum(priced.map(line => line.tax))), total: money(sum(priced.map(line => line.amount))),
    applied_discount_ids: [...applied].sort((a, b) => a - b),
    lines: priced.map(line => ({ description: line.description, quantity: line.quantity, unit_price: line.unit_price,
      subtotal: money(line.subtotal), discount_amount: money(line.discount), tax_rate: line.tax_rate,
      tax_amount: money(line.tax), amount: money(line.amount) })) };
}
