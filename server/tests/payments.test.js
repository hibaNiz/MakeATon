import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentSchema, paymentFilters } from '../src/modules/payments/validation.js';

const ok = { invoice_id: 1, method: 'UPI', amount: '10.50', date: '2026-11-01' };
test('payment input is validated', () => {
  assert.equal(paymentSchema.parse(ok).amount, 10.5);
  for (const bad of [{ amount: 0 }, { amount: -1 }, { amount: 'abc' }, { amount: 1.005 }, { method: 'BITCOIN' }, { date: '01-11-2026' }, { invoice_id: 'x' }, { extra: 1 }])
    assert.throws(() => paymentSchema.parse({ ...ok, ...bad }));
});
test('payment filters reject bad ranges and page sizes', () => {
  assert.throws(() => paymentFilters.parse({ from: '2026-02-01', to: '2026-01-01' }));
  assert.throws(() => paymentFilters.parse({ pageSize: 500 }));
  assert.equal(paymentFilters.parse({}).page, 1);
});


test('payment amounts require exact decimal paise across the supported range', () => {
  for (const amount of [0.01, 9999999999.98, '9999999999.99', ' 12.30 '])
    assert.equal(paymentSchema.parse({ ...ok, amount }).amount, Number(amount));
  for (const amount of [0.000000001, 1e-12, '1e2', '0x10', '.01', '12.300', '', true, null, Infinity, 10000000000])
    assert.throws(() => paymentSchema.parse({ ...ok, amount }));
});
