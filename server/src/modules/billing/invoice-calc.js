// Invoice maths with no database in it, so it is easy to read and to test.
//
// Every amount is handled as whole paise (integer "cents") so 0.1 + 0.2 never goes wrong.
// Order of work for one invoice:
//   1. plan fee + one line per product
//   2. product discounts (best valid one per line)
//   3. the subscription discount, spread over the lines in proportion to their value
//   4. tax on each line AFTER discounts (rounded half-up, same as the catalog price preview)
export const toCents = value => Math.round(Number(value) * 100);
export const fromCents = cents => cents / 100;
const percentOf = (cents, rate) => Math.floor((cents * toCents(rate) + 5000) / 10000);

export function discountReduction(discount, baseCents) {
  if (baseCents <= 0) return 0;
  const raw = discount.type === 'PERCENTAGE' ? percentOf(baseCents, discount.value) : toCents(discount.value);
  return Math.min(raw, baseCents); // never discount below zero
}

// Active, inside its dates for that billing period, and not used up.
export function isUsable(discount, date) {
  return discount.active
    && !(discount.start_date && date < discount.start_date)
    && !(discount.end_date && date > discount.end_date)
    && !(discount.usage_limit != null && discount.used_count >= discount.usage_limit);
}

// Split `total` paise across `weights`; leftover paise go to the biggest weights first.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const shares = weights.map(w => Math.floor((total * w) / sum));
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a] || a - b);
  for (const i of order) { if (left <= 0) break; shares[i] += 1; left -= 1; }
  return shares;
}

/**
 * plan:      { name, price }
 * lines:     [{ product_id, description, quantity, unit_price, tax_rate }]   (tax_rate 0 when none / archived)
 * discounts: product-level discount rows [{ id, scope, product_ids, type, value, ... }]
 * subscriptionDiscount: the discount row attached to the subscription, or null
 * date:      the first day of the billing period (discount dates are checked against it)
 */
export function calculateInvoice({ plan, lines, discounts = [], subscriptionDiscount = null, date }) {
  const rows = [];
  if (toCents(plan.price) > 0) {
    rows.push({ description: `${plan.name} — plan fee`, product_id: null, quantity: 1, unit: toCents(plan.price), taxRate: 0, discount: 0 });
  }
  for (const line of lines) {
    rows.push({ description: line.description, product_id: line.product_id, quantity: line.quantity,
      unit: toCents(line.unit_price), taxRate: Number(line.tax_rate || 0), discount: 0 });
  }
  rows.forEach(row => { row.gross = row.unit * row.quantity; });
  const grossAll = rows.reduce((sum, row) => sum + row.gross, 0);
  const used = new Set();

  // 2) Product discounts: the best valid one per line (they do not stack).
  for (const row of rows.filter(r => r.product_id)) {
    let best = null;
    for (const d of discounts) {
      if (d.scope !== 'PRODUCT' || !d.product_ids.includes(row.product_id) || !isUsable(d, date)) continue;
      if (d.min_quantity && row.quantity < d.min_quantity) continue;
      if (d.min_purchase && row.gross < toCents(d.min_purchase)) continue;
      const amount = discountReduction(d, row.gross);
      if (amount > 0 && (!best || amount > best.amount)) best = { d, amount };
    }
    if (best) { row.discount = best.amount; used.add(best.d.id); }
  }

  // 3) Subscription discount: eligibility uses plan fee + products before discounts.
  const d = subscriptionDiscount;
  if (d && d.scope === 'SUBSCRIPTION' && isUsable(d, date)) {
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const enoughUnits = !d.min_quantity || totalQuantity >= d.min_quantity;
    const enoughSpend = !d.min_purchase || grossAll >= toCents(d.min_purchase);
    if (enoughUnits && enoughSpend) {
      const amount = discountReduction(d, rows.reduce((sum, row) => sum + row.gross - row.discount, 0));
      if (amount > 0) {
        const shares = allocate(amount, rows.map(row => row.gross - row.discount));
        rows.forEach((row, i) => { row.discount += shares[i]; });
        used.add(d.id);
      }
    }
  }

  // 4) Tax on what is left of each line.
  for (const row of rows) {
    row.net = row.gross - row.discount;
    row.tax = percentOf(row.net, row.taxRate);
    row.amount = row.net + row.tax;
  }
  const sum = key => rows.reduce((total, row) => total + row[key], 0);
  return {
    lines: rows.map(row => ({
      description: row.description, quantity: row.quantity, unit_price: fromCents(row.unit),
      discount_amount: fromCents(row.discount), tax_rate: row.taxRate, tax_amount: fromCents(row.tax), amount: fromCents(row.amount),
    })),
    subtotal_cents: sum('gross'), discount_cents: sum('discount'), tax_cents: sum('tax'), total_cents: sum('amount'),
    subtotal: fromCents(sum('gross')), discount_total: fromCents(sum('discount')), tax_total: fromCents(sum('tax')), total: fromCents(sum('amount')),
    discount_ids: [...used].sort((a, b) => a - b),
  };
}
