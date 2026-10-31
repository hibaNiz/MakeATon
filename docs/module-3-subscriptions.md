# Subscriptions

Admin and staff can prepare quotations, record customer acceptance and manage subscriptions. Invoicing is in [module 4a](module-4a-billing.md).

## Walkthrough

1. Create products and a recurring plan in the catalog.
2. Optionally save a quotation template with a plan, products, quantities, validity days and notes.
3. Choose **Use template**, or open **Subscriptions → New subscription**. Select a customer account, dates, products and an optional subscription discount.
4. Save the draft. The server captures each product's current price plus its selected variant's extra price.
5. Choose **Issue quotation** and set its validity date. Share the quotation with the customer separately.
6. After the customer accepts, choose **Confirm acceptance**, then **Activate subscription**.
7. Pause, resume, renew or close according to the plan's rules. Closed subscriptions cannot be reopened.

Only drafts can be edited or deleted. Saving an edited draft refreshes its product prices from the catalog; quotation and later lifecycle actions preserve those saved prices. A template is copied into a new draft, so changing or deleting it does not change existing subscriptions.

## Lifecycle

| Action | From | Result / rule |
|---|---|---|
| `quote` | DRAFT | QUOTATION; validity must be today or later and no later than subscription expiry |
| `confirm` | QUOTATION | CONFIRMED; quotation and subscription must not have expired |
| `activate` | CONFIRMED | ACTIVE; rechecks catalog eligibility and expiry |
| `pause` | ACTIVE | PAUSED; plan must allow pausing and subscription must not be expired |
| `resume` | PAUSED | ACTIVE; subscription must not be expired |
| `revise` | QUOTATION | DRAFT; clears quotation validity so terms can be revised |
| `renew` | ACTIVE or PAUSED | Extends expiry after both today and the existing expiry; plan must allow renewal |
| `close` | QUOTATION, CONFIRMED, ACTIVE or PAUSED | CLOSED; closing an active/paused subscription before expiry requires the plan's early-close permission |

Renewal requires an existing expiry date and preserves the current status. An expired active or paused subscription can be renewed if its plan allows it. A closed subscription stays closed.

Dates use `YYYY-MM-DD`; today's date is evaluated in UTC. Quotation validity and subscription expiry are inclusive: a date equal to today is still valid.

**Close expired** is an explicit operation available on the subscription list. It closes active or paused subscriptions with expiry before today only when their plan has `auto_close` enabled. It applies across all customers, regardless of list filters, and is safe to repeat. No timer or background scheduler invokes it yet.

## Validation and pricing

- The customer must have the CUSTOMER role. The selected plan and products must be active; each variant must belong to its selected product.
- The subscription start date must fall within the plan's availability dates. Total product quantity must meet the plan minimum.
- Quantities are whole numbers from 1 to 10,000, with at most 100 lines. Duplicate product/variant pairs must be combined.
- Product unit prices and active product tax references are captured when the draft is saved. Callers cannot supply prices, status, subscription numbers or the next billing date.
- Plan fees and rules, discount terms, product names and tax rates remain live catalog references. This is not a complete financial snapshot.
- Subscription discounts must be active, valid on the start date, within their usage limit, and meet minimum quantity/purchase rules. Minimum purchase uses the plan fee plus product subtotal, before discounts and tax. Saving a draft, issuing a quotation and activating all check eligibility; none consumes discount usage.
- Issuing and activating recheck plan/product eligibility while retaining saved product prices. The detail screen shows a product subtotal before plan fees, discounts and tax, not an invoice total.
- Draft changes and lifecycle actions run in transactions. Row locks serialize competing actions and protect parent/line updates; subscription numbers are allocated transactionally.

## HTTP API

Every route requires a bearer token for ADMIN or STAFF. Customers cannot access these APIs.

| Method | Route | Purpose |
|---|---|---|
| GET / POST | `/api/templates` | List / create templates |
| GET / PUT / DELETE | `/api/templates/:id` | Read / replace / delete a template |
| GET / POST | `/api/subscriptions` | List subscriptions / create a draft |
| GET / PUT / DELETE | `/api/subscriptions/:id` | Read subscription / replace draft / delete draft |
| POST | `/api/subscriptions/:id/actions` | Apply a lifecycle action |
| POST | `/api/subscriptions/close-expired` | Run expiry maintenance |

Lists accept `search`, `page` and `pageSize` (maximum 100). Subscription lists additionally accept `status` and `customer_id`. Searches treat `%` and `_` literally. Detail responses include product lines; lists return `{ items, total, page, pageSize }`.

Example draft body:

```json
{
  "customer_id": 3,
  "plan_id": 1,
  "start_date": "2026-11-01",
  "expiry_date": "2027-10-31",
  "payment_term_days": 15,
  "lines": [{ "product_id": 1, "variant_id": null, "quantity": 2 }]
}
```

Template bodies use `name`, `plan_id`, `validity_days`, optional `notes` and the same product line shape. Drafts also accept optional `quotation_valid_until`, `discount_id` and `notes`.

Action bodies contain `action`, with `quotation_valid_until` optionally supplied for `quote` and `expiry_date` required for `renew`. Other action fields are rejected. For example:

```json
{ "action": "quote", "quotation_valid_until": "2026-11-30" }
```

Validation failures return 400 with field errors; invalid transitions return 409; missing records return 404. Deleting a draft or template returns 204. A successful action returns the updated subscription; expiry maintenance returns `{ "closed": 0 }` with the actual count.

## Boundary with billing

Activation sets `next_billing_date` to the subscription start date. Pause, resume and renewal preserve that pending date; closing clears it. These operations create no financial records.

Billing (module 4) reads `next_billing_date` and advances it once per invoiced period. How paused periods, live catalog terms and backdated activation affect charges is defined in [module 4a](module-4a-billing.md). Customer self-service remains future work.

## Verification

`server/tests/subscriptions.integration.test.js` exercises the HTTP API against an isolated PostgreSQL schema: permissions, strict validation, template CRUD, variant price snapshots, transaction rollback, discount eligibility, unique numbering, transitions, concurrent activation/renewal, inclusive expiry and repeatable maintenance. It checks that invoices, invoice lines and payments stay empty.

Follow the [test setup](../README.md#verification), then run from `server`:

```bash
node --test tests/subscriptions.integration.test.js
```

Frontend verification includes `npm run build` from `client`. For a manual smoke check, follow the walkthrough as admin and staff, try an invalid quantity/date, revisit the saved record, and check the forms and action dialogs at a mobile viewport. Customer access should be denied.
