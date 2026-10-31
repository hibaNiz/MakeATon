// Starts the API server and the automatic billing job.
import 'dotenv/config';
import fs from 'fs';
import { createApp } from './app.js';
import { migrate } from '../db/migrate.js';

const port = process.env.PORT || 4000;
await migrate();
const app = await createApp();
app.listen(port, () => console.log(`✅ Brightloop API running on http://localhost:${port}`));

// Billing day runs on its own: every N minutes, bill whatever is due.
// (Only once the billing module exists — see src/modules/billing.)
const minutes = Number(process.env.BILLING_INTERVAL_MINUTES ?? 60);
const billingFile = new URL('./modules/billing/billing.service.js', import.meta.url);
if (minutes > 0 && fs.existsSync(billingFile)) {
  const { runBilling } = await import(billingFile.href);
  const tick = async () => {
    try {
      const r = await runBilling({ confirm: true });
      if (r.created || r.closed) console.log(`🧾 Auto-billing: ${r.created} invoices created, ${r.closed} subscriptions closed`);
    } catch (err) {
      console.error('Auto-billing failed:', err.message);
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, minutes * 60 * 1000);
}
