# Module 4b: Payments

Admin and staff record payments against confirmed invoices (built on [module 4a](module-4a-invoices.md)). Merge [4a (invoices)](module-4a-invoices.md) first.

## Rules

- Payments are recorded only against CONFIRMED invoices. The amount must be above zero, have at most two decimals and not exceed the balance. The date cannot be in the future or before the invoice date.
- The invoice row is locked while a payment is recorded, so two payments at once cannot overpay it. `amount_paid` always equals the sum of the payments, and the invoice becomes PAID when the balance reaches zero.
- Admins can remove a mistaken payment; a PAID invoice then goes back to CONFIRMED. An invoice with payments cannot be cancelled until they are removed.
- Methods: UPI, Bank transfer, Card, Cash, Cheque. Each payment keeps who recorded it.

## API (admin and staff; removing is admin only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/payments` | List. Filters: `search`, `method`, `invoice_id`, `customer_id`, `from`, `to`, `page`, `pageSize`. Returns `items`, `total`, `sum` |
| POST | `/api/payments` | `{ invoice_id, method, amount, date, note? }` |
| DELETE | `/api/payments/:id` | Admin only |

## Screens

- **Payments** page: every payment with search, method and date filters and a total received.
- **Invoice page**: *Record payment* dialog and (admin) *Remove* on each payment.

## Code map

`server/src/modules/payments/` (validation, service, routes), `client/src/pages/payments/` (page and `RecordPaymentDialog.jsx`), `tests/payments.test.js` and `tests/payments.integration.test.js`.
