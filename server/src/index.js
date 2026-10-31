// Starts the API server and the automatic billing job.
import 'dotenv/config';
import { createApp } from './app.js';
import { migrate } from '../db/migrate.js';
import { startBillingScheduler } from './modules/billing/scheduler.js';

const port = process.env.PORT || 4000;
await migrate();
const app = await createApp();
const server = app.listen(port, () => console.log(`✅ Brightloop API running on http://localhost:${port}`));

const minutes = Number(process.env.BILLING_INTERVAL_MINUTES ?? 60);
const stopBilling = startBillingScheduler({ minutes });
server.on('close', stopBilling);
