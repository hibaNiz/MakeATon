# Brightloop — Subscription Management System

One app to run a subscription business: products and plans, quotations and subscriptions, automatic invoices, discounts and taxes, payments, and a finance dashboard. Admin, staff and customers each get their own view.

**Stack:** React (Vite) · Node.js + Express · PostgreSQL (local, plain SQL). Runs fully offline, no cloud services.

---

## What it does

| Scene from the brief | Where it lives in the app |
|---|---|
| Sign up, log in, reset password, roles | Login / Sign up pages, **Staff** page (admin only) |
| Launching a product with variants (Odoo brand +₹560) | **Products** |
| Plans: price, daily/weekly/monthly/yearly, min qty, dates, auto-close / pause / renew rules | **Plans** |
| Quotation templates → subscription | **Quotation templates** → "Use for a new quotation" |
| Draft → Quotation → Confirmed → Active → Closed | **Subscriptions** → open one → status buttons |
| Billing day: hundreds of invoices, never twice, never skipped | **Invoices** → "Run billing" (scheduled interval is configurable) |
| Taxes calculated automatically | **Taxes** (each product has a default tax) |
| Discounts (admin only): fixed/%, min purchase/qty, dates, usage limit | **Discounts** |
| Payments by method, against the right invoice | **Payments**, or "Record payment" on an invoice |
| Finance lead's view: active subs, revenue, owed, overdue | **Dashboard** |
| Customers manage their own subscriptions | Customer **portal** (planned) |

**How "never billed twice" works:** the database has a rule `UNIQUE (subscription_id, period_start)` on invoices, so the same period physically cannot be saved twice — even if two people press "Run billing" at the same moment.

**Invoice screens:** the billing engine (`/api/billing/run`) creates invoices; the **Invoices** pages list them and let staff confirm, email, print or cancel them. See [docs/module-4a-billing.md](docs/module-4a-billing.md).

**Payments:** staff record payments on a confirmed invoice or see them all on **Payments**. See [docs/module-4b-payments.md](docs/module-4b-payments.md).

**Finance dashboard:** admin and staff can track collections, outstanding balances, active subscriptions and estimated monthly recurring revenue at `/dashboard`. Choose a 3-, 6- or 12-month window for billing and collection trends and payment-method charts; receivables aging and overdue invoice links show today's balances. Charts include exact amounts and an accessible monthly data table. Billed totals use invoice dates and collections use payment dates. Estimated MRR normalizes active subscription fees before discounts, tax and proration; metric definitions are available on the page.

**Demo data:** billing seeding only bills and records payments for its own marked demo subscriptions. after `npm run db:seed`, run `npm run db:seed:billing` (about 40 demo customers with invoices and payments) or `npm run db:seed:billing -- 1500` for a large set.


---

## Run it on your laptop

You need **Node.js 20+** and **PostgreSQL 14+** installed.

> Windows: install PostgreSQL from postgresql.org (remember the password you set for the `postgres` user).
> Mac: `brew install postgresql@16 && brew services start postgresql@16`

### 1. Create the database (once)

Open **psql** (or pgAdmin) and run:

```sql
CREATE DATABASE brightloop;
```

### 2. Start the backend

```bash
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Open `server/.env` and put your PostgreSQL password into `DATABASE_URL`, e.g.
`postgresql://postgres:YOUR_PASSWORD@localhost:5432/brightloop`

```bash
npm run db:setup     # creates all tables + the admin login
npm run db:seed      # optional: loads catalog demo data
npm run dev          # API on http://localhost:4000
```

### 3. Start the frontend (in a second terminal)

```bash
cd client
npm install
npm run dev          # open http://localhost:5173
```

### Logins

| Role | Email | Password |
|---|---|---|
| Admin | admin@brightloop.com | Admin@1234 |
| Staff | staff@brightloop.com | Staff@1234 *(after seeding)* |
| Customer | customer@brightloop.com | Customer@1234 *(after seeding)* |

**Password reset emails:** with no email settings, the reset link is printed in the backend terminal (works offline). To send real emails, fill in the `SMTP_*` values in `server/.env`.

### Tests

Run `cd server && npm test` for unit tests. Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database whose name ends in `_test` to include database integration tests. Each integration suite creates and removes its own schema.

---

## Project layout

```
server/
  db/schema.sql            every table, in plain SQL
  db/setup.js, seed-catalog.js, seed-billing.js     create tables / load demo data
  src/lib/                 shared helpers (database, login, validation, dates)
  src/modules/<module>/    one folder per feature — *.routes.js files are picked up automatically
client/
  src/components/          shared UI pieces (buttons, forms, tables, layout)
  src/pages/<module>/      one folder per feature — routes.jsx is picked up automatically
docs/                      team guide, git guide, one explainer per module
```

Each module adds its own files and never edits shared files, so teammates don't get git conflicts. See [`docs/TEAM.md`](docs/TEAM.md) for who owns what and [`docs/GIT_GUIDE.md`](docs/GIT_GUIDE.md) for the git steps.
