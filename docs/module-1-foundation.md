# Module 1 — Foundation & login

## What it does
Sets up the whole project (database, server, app shell, design) and handles **who you are**: sign up, log in, forgot/reset password, and the three roles — Admin, Staff, Customer.

## Your files
- `server/db/schema.sql` — every table in plain SQL. Read the comments — this is the data model.
- `server/db/setup.js` — creates the tables and the first admin account.
- `server/src/lib/` — shared helpers: `db.js` (database connection + transactions), `auth.js` (login tokens + role checks), `validate.js` (input rules, incl. the password rule), `errors.js`, `dates.js`, `email.js`.
- `server/src/app.js` — finds every `*.routes.js` file automatically and plugs it in.
- `server/src/modules/auth/` — sign up / log in / reset (`auth.routes.js`) and managing staff & customers (`users.routes.js`).
- `client/src/` — `App.jsx` (finds every module's pages), `components/` (Layout, buttons, forms, tables, modal…), `lib/` (API helper, login state, validation), `styles.css` (one colour scheme), `pages/auth/`.

## How it works, in plain words
- **Passwords** are never stored — only a scrambled version (bcrypt hash). To check a login we scramble what you typed and compare.
- **Password rule**: more than 8 characters, an uppercase, a lowercase and a special character. Checked in the browser (instant feedback) **and** on the server (so nobody can skip it).
- **One account per email**: the `email` column is `UNIQUE` in the database, and emails are lower-cased first so `A@x.com` and `a@x.com` count as the same.
- **After login** the server gives the browser a signed token (JWT). Every later request sends it; the server checks it and knows your id and role.
- **Roles**: every API route says who's allowed, e.g. `allow('ADMIN')`. Only the admin can add staff — the server refuses even if someone fakes the button.
- **Forgot password**: we make a random one-time token, store only its hash with a 30-minute expiry, and email a link. With no email settings the link is printed in the server terminal (offline-friendly). The reply is the same whether or not the email exists, so nobody can use it to discover accounts.
- **No git conflicts**: `app.js` and `App.jsx` discover module files by name, so other modules never edit them.

## Likely judge questions
- *Why plain SQL instead of an ORM?* — It's easy to read, shows the data model directly, and needs no extra downloads (works offline).
- *How do you stop a customer seeing someone else's invoice?* — Portal queries always add `WHERE customer_id = <logged-in user>`; staff APIs reject the customer role.
- *What if two requests change the same thing at once?* — Multi-step changes run in a database transaction: all or nothing.
