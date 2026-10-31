import test from 'node:test';
import assert from 'node:assert/strict';
import { startBillingScheduler } from '../src/modules/billing/scheduler.js';

const empty = { created: 0, closed: 0, skipped: 0, errors: [], has_more: false };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const logger = () => ({ log() {}, error() {} });

test('scheduler waits for each run, drains backlog in batches, then returns to the interval', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, finish;
  const stop = startBillingScheduler({ minutes: 60, logger: logger(), run: async options => {
    assert.deepEqual(options, { confirm: true, limit: 100 });
    calls++;
    if (calls === 1) return new Promise(resolve => { finish = resolve; });
    return empty;
  } });
  t.mock.timers.tick(4999); assert.equal(calls, 0);
  t.mock.timers.tick(1); assert.equal(calls, 1);
  t.mock.timers.tick(7200000); assert.equal(calls, 1);
  finish({ ...empty, created: 100, has_more: true }); await flush();
  t.mock.timers.tick(999); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  t.mock.timers.tick(3599999); assert.equal(calls, 2);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 3);
  stop(); t.mock.timers.tick(7200000); assert.equal(calls, 3);
});

test('failed and blocked-only runs report errors and wait before retrying', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const log = logger(), error = t.mock.method(log, 'error');
  const stop = startBillingScheduler({ minutes: 1, logger: log, run: async () => {
    calls++;
    if (calls === 1) throw new Error('Unavailable');
    return { ...empty, has_more: true, errors: [{ subscription_id: 1, error: 'Invalid price' }] };
  } });
  t.mock.timers.tick(5000); await flush(); assert.equal(error.mock.callCount(), 1);
  t.mock.timers.tick(59999); assert.equal(calls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(calls, 2);
  assert.equal(error.mock.callCount(), 2);
  t.mock.timers.tick(1000); assert.equal(calls, 2);
  stop();
});

test('stopping an in-flight run prevents rescheduling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0, finish;
  const stop = startBillingScheduler({ logger: logger(), run: () => {
    calls++; return new Promise(resolve => { finish = resolve; });
  } });
  t.mock.timers.tick(5000); stop(); finish({ ...empty, created: 1, has_more: true }); await flush();
  t.mock.timers.tick(7200000); assert.equal(calls, 1);
});

test('disabled and invalid intervals never create rapid retry timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const log = logger(), error = t.mock.method(log, 'error');
  for (const minutes of [0, -1, NaN, Infinity, 999999, 0.0000001])
    startBillingScheduler({ minutes, logger: log, run: async () => { calls++; return empty; } });
  t.mock.timers.tick(7200000); await flush();
  assert.equal(calls, 0); assert.equal(error.mock.callCount(), 4);
});
