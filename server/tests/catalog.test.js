import test from 'node:test';
import assert from 'node:assert/strict';
import { schemas, previewSchema } from '../src/modules/catalog/validation.js';
import { priceProduct } from '../src/modules/catalog/pricing.js';

const product = { id: 1, name: 'Business Suite', sales_price: 1200 };
const discount = { id: 1, name: 'Team 10%', active: true, type: 'PERCENTAGE', scope: 'PRODUCT', value: 10, product_ids: [1], min_quantity: 10, min_purchase: 10000, used_count: 0, usage_limit: 100 };
const price = overrides => priceProduct({ product, variant: { attribute: 'Brand', value: 'Odoo', extra_price: 560 }, tax: { rate: 18, active: true }, discount, quantity: 10, date: '2026-10-31', ...overrides });

test('Odoo variant, volume discount and GST produce a verifiable breakdown', () => {
  const result = price();
  assert.equal(result.unit_price, 1760);
  assert.equal(result.subtotal, 17600);
  assert.equal(result.discount_amount, 1760);
  assert.equal(result.taxable_amount, 15840);
  assert.equal(result.tax_amount, 2851.2);
  assert.equal(result.total, 18691.2);
  assert.equal(discount.used_count, 0);
});

test('eligibility explains minimum quantity and minimum purchase failures', () => {
  const result = price({ quantity: 1 });
  assert.equal(result.discount.eligible, false);
  assert.equal(result.discount.reasons.length, 2);
  assert.equal(result.discount_amount, 0);
  assert.equal(result.total, 2076.8);
});

for (const [label, changes, reason] of [
  ['archived', { active: false }, 'archived'],
  ['not started', { start_date: '2026-11-01' }, 'not started'],
  ['expired', { end_date: '2026-10-30' }, 'expired'],
  ['exhausted', { used_count: 100 }, 'usage limit'],
  ['wrong product', { product_ids: [2] }, 'does not include'],
  ['subscription scope', { scope: 'SUBSCRIPTION' }, 'full subscription'],
]) test(`discount is rejected when ${label}`, () => {
  const result = price({ discount: { ...discount, ...changes } });
  assert.equal(result.discount_amount, 0);
  assert.ok(result.discount.reasons.some(item => item.includes(reason)));
});

test('date bounds are inclusive and unlimited usage accepts prior uses', () => {
  assert.equal(price({ discount: { ...discount, start_date: '2026-10-31', end_date: '2026-10-31', used_count: 1000, usage_limit: null } }).discount.eligible, true);
});
test('fixed discounts are capped at the subtotal and cannot cause negative tax', () => {
  const result = price({ discount: { ...discount, type: 'FIXED', value: 50000 } });
  assert.equal(result.discount_amount, 17600);
  assert.equal(result.total, 0);
});
test('percentage rounding uses half-up paise, including a half-paise discount', () => {
  const result = price({ product: { ...product, sales_price: 0.05 }, variant: null, quantity: 1, discount: { ...discount, min_purchase: null, min_quantity: null, value: 10 }, tax: null });
  assert.equal(result.discount_amount, 0.01);
  assert.equal(result.total, 0.04);
});
test('tax rounds half-up and inactive tax is excluded with an explanation', () => {
  assert.equal(price({ product: { ...product, sales_price: 0.05 }, variant: null, quantity: 1, discount: null, tax: { active: true, rate: 10 } }).tax_amount, 0.01);
  const result = price({ tax: { active: false, rate: 18 } });
  assert.equal(result.tax_amount, 0);
  assert.match(result.notes[0], /archived/);
});
test('large allowed values retain cent precision through percentage arithmetic', () => {
  const result = price({ product: { ...product, sales_price: 99999999.99 }, variant: { extra_price: 99999999.99 }, quantity: 10000, discount: null, tax: { active: true, rate: 100 } });
  assert.equal(result.total, 3999999999600);
});

const plan = { name: 'Monthly', price: 50, billing_period: 'MONTHLY', min_quantity: 1, auto_close: false, closable: true, pausable: true, renewable: true };
test('plan validation checks calendar dates, range and quantity', () => {
  for (const patch of [{ start_date: '2026-02-30' }, { start_date: '2026-12-31', end_date: '2026-01-01' }, { min_quantity: 0 }, { min_quantity: 1.5 }, { min_quantity: true }]) {
    assert.equal(schemas.plans.safeParse({ ...plan, ...patch }).success, false);
  }
  assert.equal(schemas.plans.safeParse({ ...plan, start_date: '2028-02-29' }).success, true);
});
test('money rejects blank, null, boolean, negative and excess precision', () => {
  for (const rate of ['', null, true, -1, 1.001, 100.01]) assert.equal(schemas.taxes.safeParse({ name: 'GST', rate }).success, false);
  assert.equal(schemas.taxes.safeParse({ name: 'GST', rate: '18.25' }).success, true);
});
test('discount validation enforces scope, percentage bounds and server-owned usage', () => {
  const data = { name: 'Offer', type: 'PERCENTAGE', scope: 'PRODUCT', value: 10, product_ids: [1] };
  for (const patch of [{ value: 101 }, { value: 0 }, { product_ids: [] }, { product_ids: [1, 1] }, { scope: 'SUBSCRIPTION' }, { usage_limit: 0 }, { used_count: 3 }]) {
    assert.equal(schemas.discounts.safeParse({ ...data, ...patch }).success, false);
  }
  assert.equal(schemas.discounts.safeParse(data).success, true);
});
test('duplicate variant pairs and IDs are rejected', () => {
  const data = { name: 'Suite', type: 'SOFTWARE', sales_price: 10, cost_price: 2, variants: [{ id: 1, attribute: 'Brand', value: 'Odoo', extra_price: 5 }, { id: 2, attribute: 'brand', value: 'ODOO', extra_price: 10 }] };
  assert.equal(schemas.products.safeParse(data).success, false);
  data.variants[1] = { ...data.variants[1], id: 1, value: 'Other' };
  assert.equal(schemas.products.safeParse(data).success, false);
});
test('preview requires a product and a bounded positive quantity', () => {
  for (const data of [{ product_id: 0, quantity: 1 }, { product_id: 1, quantity: 0 }, { product_id: 1, quantity: 10001 }, { product_id: true, quantity: 1 }]) {
    assert.equal(previewSchema.safeParse(data).success, false);
  }
});
