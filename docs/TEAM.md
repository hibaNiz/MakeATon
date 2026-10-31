# Who builds what

**Current status:** foundation, catalog, quotation templates and subscription lifecycles are implemented. Billing and invoices are implemented ([module 4a](module-4a-billing.md)); payments are implemented ([module 4b](module-4b-payments.md)). The dashboard and the customer portal remain planned. See [README](../README.md) and [subscription notes](module-3-subscriptions.md). The ownership and demo below describe the full intended project.

The app is split into **4 modules**. Each person owns one, commits it from **their own laptop**, and can explain it to the judges. Modules only *add* files — nobody edits anyone else's files — so there are no git conflicts.

| # | Module | Owner | Git level | What's in it |
|---|---|---|---|---|
| 1 | **Foundation & login** | Indraneel (repo owner) | comfortable | Repo setup, database schema, shared helpers, app shell & design, sign up / log in / reset password, roles, customers & staff |
| 2 | **Catalog** | Teammate new to git | beginner | Products + variants, plans, taxes, discounts (admin-only) |
| 3 | **Subscriptions & billing** | Teammate who knows git | comfortable | Quotation templates, subscription life-cycle, the billing engine, invoices |
| 4 | **Payments, dashboard & portal** | Teammate new to git | beginner | Recording payments, finance dashboard, customer self-service portal, demo data, tests |

*(Swap names as you like — 2 and 4 are the most self-contained, which is why they suit the git newcomers.)*

## Order to merge

```
1 Foundation  →  2 Catalog  →  3 Subscriptions & billing  →  4 Payments, dashboard & portal
```

Everyone can push their branch at any time, but **merge the pull requests in this order**, because each module uses the one before it (e.g. subscriptions need products and plans; the dashboard needs invoices). After each merge, everyone runs `git pull`.

The app works at every stage: missing pages just say "This page isn't here yet".

## Steps

1. **Indraneel** creates the GitHub repo, adds the other three as collaborators, unzips `module-1-foundation.zip`, and pushes it (see GIT_GUIDE.md — on `main` this first time is fine).
2. Everyone else clones the repo and follows **GIT_GUIDE.md** with their own zip.
3. After all 4 are merged: `cd server && npm run db:setup && npm run db:seed`, start both servers, and run through the demo.

## Before the judges

Read your module's notes in `docs/` — they explain how your part works in plain words and list the questions judges are likely to ask. Open your files and follow along once; make one small change of your own (a label, a validation message) and commit it, so you've touched the code yourself.

## Planned demo script (after all four modules)

The current subscription demo ends after staff record customer acceptance and activate the subscription. Quotation sharing is separate; portal acceptance and the billing steps below are future work. Performance figures must be measured once those modules exist.

1. **Admin** → Products: show *Brightloop CRM* with the *Odoo* variant (+₹560). Plans: show the rules (auto-close, pause, renew).
2. Discounts: show "Bulk seats 10% off CRM" (min 10 qty) — only the admin sees the *New discount* button; log in as staff to prove it.
3. **Staff** → Quotation templates → *Use for a new quotation* → pick a customer → Create draft → Send quotation.
4. **Customer** (another browser / incognito) → Portal → *Accept quotation*.
5. **Staff** → Activate → *Create next invoice* → see discount + GST filled in → Confirm → Record payment → Paid.
6. Invoices → *Run billing now* → hundreds created; run it again → **0 created** (never billed twice).
7. **Dashboard** → active subs, MRR, collected vs owed, overdue list. Mention: 2,000 subscriptions loaded, pages respond in milliseconds.
8. Sign-up page: try a weak password → live rule checklist; try an existing email → "already registered".
