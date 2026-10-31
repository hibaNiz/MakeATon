# Brightloop — Subscription Management System

Manage customers, products, recurring plans, quotation templates and subscription lifecycles.

**Stack:** React (Vite), Node.js + Express, PostgreSQL with plain SQL. The app runs locally; SMTP is optional for password reset emails.

## Current status

| Feature | Status |
|---|---|
| Sign up, log in, password reset, role permissions, customers and staff | Implemented |
| Products and variants, recurring plans, taxes, discounts | Implemented; only admins can change discounts |
| Quotation templates and subscription drafts | Implemented |
| Quote, confirm acceptance, activate, pause, resume, renew and close | Implemented for admin and staff |
| Close expired subscriptions | Manual operation; follows each plan's auto-close rule |
| Billing engine and invoices (draft, confirm, send, cancel, print) | Implemented for admin and staff |
| Recording payments (by method, against confirmed invoices) | Implemented for admin and staff; only admins remove a payment |
| Finance dashboard and customer self-service portal | Pending |

**Billing is in.** Active subscriptions are invoiced automatically every hour (or with **Run billing**). Staff record payments against confirmed invoices. Subscription actions still do not send quotations; staff record acceptance obtained from the customer separately. The finance dashboard and customer portal are not built yet, and their pages display a placeholder.

See [subscription behavior and API](docs/module-3-subscriptions.md) for lifecycle rules and [billing](docs/module-4a-billing.md) and [payments](docs/module-4b-payments.md) for invoice and payment rules and the API.

## Run locally

You need **Node.js 20+** and **PostgreSQL 14+**.

### 1. Create the database

In psql or pgAdmin:

```sql
CREATE DATABASE brightloop;
```

### 2. Start the backend

```bash
cd server
npm install
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env`. Set `DATABASE_URL` to your local PostgreSQL connection and set `JWT_SECRET` to a long random value in `server/.env`.

**`db:setup` deletes existing tables and data. Run it only against a new or disposable database.** `db:reset` also deletes data.

```bash
npm run db:setup
npm run db:seed   # optional: a small catalog and demo staff/customer accounts
npm run dev      # API on http://localhost:4000
```

The catalog seed preserves existing records with matching names. It does not generate subscriptions, invoices or payments.

Optional billing demo data (run `npm run db:seed` first): `npm run db:seed:billing` adds about 40 demo customers with active subscriptions, runs billing. `npm run db:seed:billing -- 1500` loads a larger set for speed checks. Demo customers log in as `demo.customerN@example.com` / `Customer@1234`.

### 3. Start the frontend

In another terminal:

```bash
cd client
npm install
npm run dev      # http://localhost:5173
```

### Demo logins

| Role | Email | Password |
|---|---|---|
| Admin | admin@brightloop.com | Admin@1234 |
| Staff, after seeding | staff@brightloop.com | Staff@1234 |
| Customer, after seeding | customer@brightloop.com | Customer@1234 |

These are local demo credentials. Change them before using real data.

Without SMTP settings, password reset emails are printed in the backend terminal. Configure `SMTP_*` and `MAIL_FROM` in `server/.env` to send them. Reset links expire after 30 minutes; completing a reset invalidates existing sessions.

## Verification

Create a separate test database once:

```sql
CREATE DATABASE brightloop_test;
```

Set `TEST_DATABASE_URL` in `server/.env` to its connection string. The database name must end in `_test`. Tests create and remove isolated schemas; the database user needs permission to do so. They start their own HTTP servers and need neither a running app server nor demo data.

```bash
cd server
npm test
```

Without `TEST_DATABASE_URL`, database integration suites are skipped. The suite covers authentication and session expiry, catalog permissions and validation, subscription price snapshots, lifecycle rules, concurrent actions, and expiry maintenance. Billing has its own suites: invoice maths (discounts, tax after discount, rounding, allocation) and an API suite covering permissions, validation, no double billing under parallel requests, catch-up of missed periods, overdue rules and discount usage restore. Payments add tests for validation, partial and full payment, overpayment races and admin-only removal.

Check the frontend production build:

```bash
cd client
npm run build
```

## Project layout

```text
server/
  db/schema.sql            database tables
  db/setup.js              destructive setup for a new/disposable database
  db/seed-catalog.js       small catalog and demo accounts
  src/lib/                 shared database, auth, date and validation helpers
  src/modules/<module>/    feature APIs; *.routes.js files load automatically
  tests/                   Node test runner and PostgreSQL integration tests
client/
  src/components/          shared UI and layout
  src/pages/<module>/      feature screens; routes.jsx files load automatically
docs/                      module notes and team/git guides
```

The [team guide](docs/TEAM.md) describes the planned four-module split. The [git guide](docs/GIT_GUIDE.md) covers the collaboration workflow.
