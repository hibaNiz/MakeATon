import test from 'node:test';
import assert from 'node:assert/strict';
import { priceInvoice } from '../src/modules/billing/pricing.js';

const line = { product_id: 1, product_name: 'CRM', unit_price: 100, quantity: 2, tax_active: true, tax_rate: 18 };
const discount = { id: 1, active: true, type: 'PERCENTAGE', value: 10, scope: 'PRODUCT', product_ids: [1], used_count: 0 };
const price = options => priceInvoice({ plan: { name: 'Monthly', price: 100 }, lines: [line], date: '2026-01-31', ...options });

test('plan fee, best product discount, subscription discount and tax reconcile', () => {
  const result = price({ discount_id: 3, discounts: [discount,
    { ...discount, id: 2, type: 'FIXED', value: 15 },
    { ...discount, id: 3, scope: 'SUBSCRIPTION', type: 'FIXED', value: 28 },
  ] });
  assert.equal(result.subtotal, 300);
  assert.equal(result.discount_total, 48);
  assert.equal(result.tax_total, 29.16);
  assert.equal(result.total, 281.16);
  assert.deepEqual(result.applied_discount_ids, [1, 3]);
  assert.equal(result.lines[0].discount_amount, 10);
  assert.equal(result.lines[1].discount_amount, 38);
});

test('partial periods prorate extended prices and fixed discounts once in paise', () => {
  const result = price({ plan: { name: 'Monthly', price: 31 }, lines: [{ ...line, quantity: 3 }],
    billable_days: 10, period_days: 31, discounts: [{ ...discount, type: 'FIXED', value: 31 }] });
  assert.equal(result.lines[0].subtotal, 10);
  assert.equal(result.lines[1].unit_price, 100);
  assert.equal(result.lines[1].subtotal, 96.77);
  assert.equal(result.discount_total, 10);
  assert.equal(result.tax_total, 15.62);
  assert.equal(result.total, 112.39);
});

test('a one-paisa discount is allocated once across lines with stable rounding', () => {
  const result = price({ plan: { name: 'Plan', price: 0.01 }, lines: [{ ...line, unit_price: 0.01, quantity: 1 }],
    discount_id: 1, discounts: [{ ...discount, scope: 'SUBSCRIPTION', type: 'FIXED', value: 0.01 }] });
  assert.equal(result.subtotal, 0.02);
  assert.equal(result.discount_total, 0.01);
  assert.equal(result.total, 0.01);
  assert.deepEqual(result.lines.map(item => item.discount_amount), [0.01, 0]);
});

test('discount rules include dates, quantity, purchase and remaining uses', () => {
  for (const patch of [{ active: false }, { start_date: '2026-02-01' }, { end_date: '2026-01-30' },
    { min_quantity: 3 }, { min_purchase: 201 }, { usage_limit: 1, used_count: 1 }, { product_ids: [2] }]) {
    assert.equal(price({ discounts: [{ ...discount, ...patch }] }).discount_total, 0);
  }
  assert.equal(price({ discounts: [{ ...discount, start_date: '2026-01-31', end_date: '2026-01-31',
    min_quantity: 2, min_purchase: 200, usage_limit: 1 }] }).discount_total, 20);
  assert.equal(price({ billable_days: 1, period_days: 31,
    discounts: [{ ...discount, min_purchase: 200 }] }).discount_total, 0);
});

test('equal discounts choose the lower ID and usage is once per invoice', () => {
  const result = price({ lines: [line, line], discounts: [{ ...discount, id: 2 }, discount] });
  assert.deepEqual(result.applied_discount_ids, [1]);
  assert.equal(result.discount_total, 40);
});

test('discounts cap at subtotal and zero-price lines never consume usage', () => {
  const result = price({ discounts: [{ ...discount, type: 'FIXED', value: 99999 }],
    lines: [line, { ...line, unit_price: 0 }] });
  assert.equal(result.total, 100);
  assert.equal(result.tax_total, 0);
  assert.equal(result.lines[2].discount_amount, 0);
  assert.deepEqual(price({ lines: [{ ...line, unit_price: 0 }], discounts: [discount] }).applied_discount_ids, []);
});

test('tax rounds half-up and archived taxes do not apply', () => {
  assert.equal(price({ lines: [{ ...line, unit_price: 0.05, quantity: 1, tax_rate: 10 }] }).tax_total, 0.01);
  assert.equal(price({ lines: [{ ...line, tax_active: false }] }).tax_total, 0);
});

test('large totals and invalid proration fail before saving an invoice', () => {
  assert.throws(() => price({ lines: [{ ...line, unit_price: 99999999.99, quantity: 10000 }] }), { status: 409 });
  assert.throws(() => price({ billable_days: 2, period_days: 1 }), { status: 409 });
  assert.throws(() => price({ lines: [] }), { status: 409 });
});
