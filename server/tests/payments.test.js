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
