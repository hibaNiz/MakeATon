import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInvoice, allocate, discountReduction, isUsable } from '../src/modules/billing/invoice-calc.js';
import { startingStatus } from '../src/modules/billing/billing.service.js';
import { invoiceFilters } from '../src/modules/billing/validation.js';

const plan = { name: 'Monthly', price: 99 };
const line = (o = {}) => ({ product_id: 1, description: 'CRM', quantity: 2, unit_price: 1760, tax_rate: 18, ...o });

test('plan fee is untaxed and product tax is added to the line', () => {
  const r = calculateInvoice({ plan, lines: [line()], date: '2026-11-01' });
  assert.equal(r.subtotal, 3619);
  assert.equal(r.tax_total, 633.6);
  assert.equal(r.total, 4252.6);
  assert.equal(r.lines.length, 2);
});

test('tax is calculated after discounts', () => {
  const d = { id: 5, scope: 'PRODUCT', product_ids: [1], type: 'PERCENTAGE', value: 10, active: true };
  const r = calculateInvoice({ plan, lines: [line()], discounts: [d], date: '2026-11-01' });
  assert.equal(r.discount_total, 352);
  assert.equal(r.tax_total, 570.24);
  assert.deepEqual(r.discount_ids, [5]);
});

test('only the best product discount applies, minimums and dates are respected', () => {
  const base = { scope: 'PRODUCT', product_ids: [1], active: true };
  const ds = [
    { ...base, id: 1, type: 'FIXED', value: 50 },
    { ...base, id: 2, type: 'FIXED', value: 200 },
    { ...base, id: 3, type: 'FIXED', value: 999, min_quantity: 5 },
    { ...base, id: 4, type: 'FIXED', value: 999, start_date: '2027-01-01' },
    { ...base, id: 6, type: 'FIXED', value: 999, usage_limit: 1, used_count: 1 },
  ];
  const r = calculateInvoice({ plan, lines: [line()], discounts: ds, date: '2026-11-01' });
  assert.equal(r.discount_total, 200);
  assert.deepEqual(r.discount_ids, [2]);
});

test('a subscription discount is spread over the lines and never goes below zero', () => {
  const d = { id: 9, scope: 'SUBSCRIPTION', type: 'FIXED', value: 100000, active: true };
  const r = calculateInvoice({ plan, lines: [line()], subscriptionDiscount: d, date: '2026-11-01' });
  assert.equal(r.total, 0);
  assert.equal(r.discount_total, r.subtotal);
  assert.equal(startingStatus(r.total_cents, true), 'PAID');
  assert.equal(startingStatus(100, true), 'CONFIRMED');
  assert.equal(startingStatus(100, false), 'DRAFT');
});

test('subscription discount minimums use the pre-discount subtotal', () => {
  const d = { id: 9, scope: 'SUBSCRIPTION', type: 'PERCENTAGE', value: 10, min_purchase: 4000, active: true };
  assert.equal(calculateInvoice({ plan, lines: [line()], subscriptionDiscount: d, date: '2026-11-01' }).discount_total, 0);
  assert.equal(calculateInvoice({ plan, lines: [line({ quantity: 3 })], subscriptionDiscount: d, date: '2026-11-01' }).discount_total, 537.9);
});

test('allocation never loses or invents a paisa', () => {
  for (const [total, weights] of [[100, [1, 1, 1]], [1, [5, 5]], [999, [3, 7, 11]], [0, [1, 2]], [50, [0, 0]]]) {
    const parts = allocate(total, weights);
    assert.equal(parts.reduce((a, b) => a + b, 0), weights.every(w => w === 0) ? 0 : total);
  }
});

test('totals always equal the sum of the lines', () => {
  const d = { id: 9, scope: 'SUBSCRIPTION', type: 'PERCENTAGE', value: 33.33, active: true };
  const r = calculateInvoice({ plan: { name: 'P', price: 33.33 }, lines: [line({ unit_price: 19.99, quantity: 3, tax_rate: 5 }), line({ product_id: 2, unit_price: 7.77, tax_rate: 12 })], subscriptionDiscount: d, date: '2026-11-01' });
  const cents = k => r.lines.reduce((s, l) => s + Math.round(l[k] * 100), 0);
  assert.equal(cents('amount'), r.total_cents);
  assert.equal(cents('tax_amount'), r.tax_cents);
  assert.equal(cents('discount_amount'), r.discount_cents);
});

test('discount helpers', () => {
  assert.equal(discountReduction({ type: 'PERCENTAGE', value: 12.5 }, 101), 13);
  assert.equal(discountReduction({ type: 'FIXED', value: 500 }, 1000), 1000);
  assert.equal(discountReduction({ type: 'FIXED', value: 5 }, 0), 0);
  assert.equal(isUsable({ active: false }, '2026-01-01'), false);
  assert.equal(isUsable({ active: true, end_date: '2026-01-01' }, '2026-01-02'), false);
  assert.equal(isUsable({ active: true, end_date: '2026-01-01' }, '2026-01-01'), true);
});

test('invoice filters reject bad ranges and page sizes', () => {
  assert.throws(() => invoiceFilters.parse({ from: '2026-02-01', to: '2026-01-01' }));
  assert.throws(() => invoiceFilters.parse({ pageSize: 500 }));
  assert.equal(invoiceFilters.parse({}).page, 1);
});
