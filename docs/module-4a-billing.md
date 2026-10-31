# Module 4a: Billing and invoices

Admin and staff can turn active subscriptions into invoices, confirm, send, print and cancel them. Recording payments is module 4b (payments); the finance dashboard and customer portal come later.

## How a period gets billed

- A subscription is billed one period at a time, starting at its `next_billing_date`. After each invoice the date moves forward by one plan period (day, week, month or year).
- The database enforces `UNIQUE (subscription_id, period_start)` and each subscription row is locked while it is billed. Two people (or the hourly job and a button click) cannot create the same period twice.
- **Run billing** and the hourly job (`BILLING_INTERVAL_MINUTES`, default 60, set 0 to switch off) bill every ACTIVE subscription whose date has arrived. Missed periods are caught up (up to 400 per subscription per run; the next run continues). Both then close expired subscriptions whose plan has auto-close on.
- **Create next invoice** (subscription page) bills only a period that has already started, so a double click cannot bill months ahead.
- Paused subscriptions are skipped. Periods that fell due while paused are billed after it resumes, because resuming never skips a period. A period is billed if it starts on or before the expiry date (inclusive). There is no proration.
- Invoice date is the day billing ran. Due date is invoice date plus the subscription's payment terms.

## How an invoice is calculated

All money is whole paise internally, rounded half-up.

1. One line for the plan fee (no tax) and one per product at the price saved on the subscription.
2. Product discounts: the best valid one per line. Discounts do not stack.
3. The subscription discount (if any) is shared across the lines in proportion to their value. Minimums are checked against the amounts before discounts.
4. Tax per line, **after** discounts, using the current tax rate (0 if the tax is archived).

A discount counts as used once per invoice. Cancelling an invoice gives the use back. Discount dates are checked against the first day of the period being billed. Totals above INR 9,999,999,999.99 are refused.

## Invoice status

| Status | Meaning |
|---|---|
| DRAFT | Created by the button. Can be confirmed or cancelled. |
| CONFIRMED | Ready for payment. Shows as *Partly paid* once something is paid, and *Overdue* when past the due date with a balance. |
| PAID | Fully paid, or confirmed with a zero total. |
| CANCELLED | Not payable. The period is not billed again. Only possible with no payments on it. |

Run billing confirms invoices by default (untick the box to leave them as drafts).

## Payments

Invoices show their payments (read only here). Recording and removing payments is [module 4b](module-4b-payments.md); until it is merged, confirmed invoices stay unpaid.

## API (admin and staff)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/invoices` | List. Filters: `search`, `status`, `overdue=true`, `unpaid=true`, `customer_id`, `subscription_id`, `from`, `to`, `page`, `pageSize`. Returns `items`, `total`, `balance` |
| GET | `/api/invoices/:id` | Invoice with lines and payments |
| POST | `/api/invoices` | `{ subscription_id }` create the next period's draft invoice |
| POST | `/api/invoices/run-billing` | `{ confirm }` returns `created`, `skipped`, `errors`, `closed` |
| POST | `/api/invoices/confirm-drafts` | Confirm every draft |
| POST | `/api/invoices/:id/actions` | `{ action: confirm \| cancel \| send }` |

Sending an invoice emails the customer, or prints the email in the server terminal when SMTP is not configured.

## Code map

- `server/src/modules/billing/invoice-calc.js`: the maths, no database.
- `billing.service.js`: billing engine. `invoices.service.js`: reading and actions. `validation.js`: input rules.
- `client/src/pages/billing/`; the subscription page shows its invoices through `SubscriptionInvoices.jsx`.
- Tests: `tests/billing.test.js` (maths and filters), `tests/billing.integration.test.js` (API).
