import test from 'node:test';
import assert from 'node:assert/strict';
import { billingWindow } from '../src/modules/billing/schedule.js';

const window = (start, pending, period, expiry) => billingWindow({
  start_date: start, next_billing_date: pending, expiry_date: expiry,
}, period);

test('monthly dates retain the original day across short months', () => {
  let pending = '2025-01-31';
  for (const next of ['2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31']) {
    const result = window('2025-01-31', pending, 'MONTHLY');
    assert.equal(result.next_billing_date, next);
    assert.equal(result.billable_days, result.period_days);
    pending = next;
  }
  assert.equal(window('2024-01-30', '2024-02-29', 'MONTHLY').next_billing_date, '2024-03-30');
});

test('yearly dates return to leap day in leap years', () => {
  let pending = '2024-02-29';
  for (const next of ['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']) {
    const result = window('2024-02-29', pending, 'YEARLY');
    assert.equal(result.next_billing_date, next);
    pending = next;
  }
});

test('daily and weekly periods use UTC calendar days across year boundaries', () => {
  assert.deepEqual(window('2025-12-31', '2025-12-31', 'DAILY'), {
    period_start: '2025-12-31', period_end: '2025-12-31', next_billing_date: '2026-01-01',
    billable_days: 1, period_days: 1,
  });
  assert.equal(window('2025-12-31', '2026-01-07', 'WEEKLY').next_billing_date, '2026-01-14');
});

test('partial final periods count expiry inclusively for daily proration', () => {
  assert.deepEqual(window('2025-01-31', '2025-02-28', 'MONTHLY', '2025-03-09'), {
    period_start: '2025-02-28', period_end: '2025-03-09', next_billing_date: '2025-03-10',
    billable_days: 10, period_days: 31,
  });
  const singleDay = window('2025-01-01', '2025-01-01', 'MONTHLY', '2025-01-01');
  assert.equal(singleDay.billable_days, 1);
  assert.equal(singleDay.period_days, 31);
});

test('renewing a partial period covers the remainder using the original cycle length', () => {
  assert.deepEqual(window('2025-01-31', '2025-03-10', 'MONTHLY', '2025-05-01'), {
    period_start: '2025-03-10', period_end: '2025-03-30', next_billing_date: '2025-03-31',
    billable_days: 21, period_days: 31,
  });
  const weekly = window('2025-01-01', '2025-01-04', 'WEEKLY', '2025-02-01');
  assert.equal(weekly.billable_days, 4); assert.equal(weekly.period_days, 7);
});

test('invalid dates and unsupported calendar overflow fail before billing', () => {
  for (const args of [
    ['2025-02-30', '2025-03-01', 'MONTHLY'], ['2025-01-01', '2024-12-31', 'DAILY'],
    ['2025-01-01', '2025-01-01', 'UNKNOWN'], ['2025-01-01', '2025-02-01', 'MONTHLY', '2025-01-31'],
    ['9999-12-31', '9999-12-31', 'MONTHLY'],
  ]) assert.throws(() => window(...args), { status: 409 });
});
