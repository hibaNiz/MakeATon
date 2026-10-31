import { runBilling } from './billing.service.js';

export function startBillingScheduler({ minutes = 60, run = runBilling, logger = console } = {}) {
  const interval = minutes * 60000;
  if (Number.isFinite(minutes) && minutes <= 0) return () => {};
  if (!Number.isFinite(interval) || interval < 1 || interval > 2147483647) {
    logger.error('Billing interval must be a positive number within the timer limit, or 0 to disable it');
    return () => {};
  }
  let stopped = false, timer;
  const schedule = delay => { timer = setTimeout(tick, delay); timer.unref?.(); };
  const tick = async () => {
    let delay = interval;
    try {
      const result = await run({ confirm: true, limit: 100 });
      if (result.created || result.closed)
        logger.log(`Auto-billing: ${result.created} invoices created, ${result.closed} subscriptions closed`);
      if (result.errors.length) logger.error('Auto-billing left pending subscriptions:', result.errors);
      // Drain healthy backlogs in small batches. Failed/locked-only runs wait for
      // the regular interval so one bad subscription cannot create a tight loop.
      if (result.has_more && (result.created || result.closed || result.skipped)) delay = 1000;
    } catch (error) {
      logger.error('Auto-billing failed:', error.message);
    } finally {
      if (!stopped) schedule(delay);
    }
  };
  // Schedule the next tick only after this one finishes, preventing local overlap.
  schedule(5000);
  return () => { stopped = true; clearTimeout(timer); };
}
