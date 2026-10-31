-- =============================================================
--  Brightloop — database schema (plain PostgreSQL)
--  Run with:  npm run db:setup   (drops & recreates all tables)
--  Every table the app uses is defined here, in plain SQL.
-- =============================================================

DROP TABLE IF EXISTS payments, invoice_lines, invoices, subscription_lines, subscriptions,
  template_lines, quotation_templates, discount_products, discounts, plans,
  product_variants, products, taxes, users, sequences CASCADE;
DROP TYPE IF EXISTS user_role, product_type, billing_period, discount_type, discount_scope,
  subscription_status, invoice_status, payment_method CASCADE;

-- ---------- Users & roles (Module 1: Auth) ----------
CREATE TYPE user_role AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

CREATE TABLE users (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  email              TEXT NOT NULL UNIQUE,          -- one account per email
  password_hash      TEXT NOT NULL,
  role               user_role NOT NULL DEFAULT 'CUSTOMER',
  phone              TEXT,
  company            TEXT,
  address            TEXT,
  reset_token_hash   TEXT,                          -- sha256 of the reset token, never the raw token
  reset_token_expiry TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role);

-- ---------- Catalog (Module 2: Products, plans, taxes, discounts) ----------
CREATE TYPE product_type AS ENUM ('SOFTWARE', 'SERVICE', 'ADDON', 'GOODS');

CREATE TABLE taxes (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,                         -- e.g. "GST 18%"
  rate       NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  type        product_type NOT NULL DEFAULT 'SOFTWARE',
  sales_price NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price  NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
  notes       TEXT,
  tax_id      INT REFERENCES taxes(id),             -- default tax when this product is billed
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A variant adds an extra price, e.g. attribute "Brand", value "Odoo", extra_price 560
CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute   TEXT NOT NULL,
  value       TEXT NOT NULL,
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TYPE billing_period AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE plans (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  price          NUMERIC(12,2) NOT NULL CHECK (price >= 0), -- recurring base fee per period
  billing_period billing_period NOT NULL DEFAULT 'MONTHLY',
  min_quantity   INT NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  start_date     DATE,                              -- plan available from
  end_date       DATE,                              -- plan available until
  auto_close     BOOLEAN NOT NULL DEFAULT false,    -- subscriptions close by themselves at expiry
  closable       BOOLEAN NOT NULL DEFAULT true,     -- can be closed early
  pausable       BOOLEAN NOT NULL DEFAULT false,
  renewable      BOOLEAN NOT NULL DEFAULT true,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE discount_type  AS ENUM ('FIXED', 'PERCENTAGE');
CREATE TYPE discount_scope AS ENUM ('PRODUCT', 'SUBSCRIPTION');

CREATE TABLE discounts (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  type         discount_type NOT NULL,
  value        NUMERIC(12,2) NOT NULL CHECK (value > 0),
  scope        discount_scope NOT NULL DEFAULT 'SUBSCRIPTION',
  min_purchase NUMERIC(12,2),
  min_quantity INT,
  start_date   DATE,
  end_date     DATE,
  usage_limit  INT,                                 -- NULL = unlimited
  used_count   INT NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which products a PRODUCT-scope discount applies to
CREATE TABLE discount_products (
  discount_id INT NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_id, product_id)
);

-- ---------- Subscriptions (Module 3) ----------
CREATE TABLE quotation_templates (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  validity_days INT NOT NULL DEFAULT 30 CHECK (validity_days > 0),
  plan_id       INT NOT NULL REFERENCES plans(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE template_lines (
  id          SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id),
  variant_id  INT REFERENCES product_variants(id),
  quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE TYPE subscription_status AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED');

CREATE TABLE subscriptions (
  id                    SERIAL PRIMARY KEY,
  number                TEXT NOT NULL UNIQUE,       -- e.g. SUB-00042
  customer_id           INT NOT NULL REFERENCES users(id),
  plan_id               INT NOT NULL REFERENCES plans(id),
  status                subscription_status NOT NULL DEFAULT 'DRAFT',
  start_date            DATE NOT NULL,
  expiry_date           DATE,
  payment_term_days     INT NOT NULL DEFAULT 15 CHECK (payment_term_days >= 0),
  quotation_valid_until DATE,
  next_billing_date     DATE,                       -- set when it becomes ACTIVE
  discount_id           INT REFERENCES discounts(id), -- SUBSCRIPTION-scope discount
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_status   ON subscriptions(status);
CREATE INDEX idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX idx_subs_billing  ON subscriptions(next_billing_date) WHERE status = 'ACTIVE';

CREATE TABLE subscription_lines (
  id              SERIAL PRIMARY KEY,
  subscription_id INT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id      INT NOT NULL REFERENCES products(id),
  variant_id      INT REFERENCES product_variants(id),
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  tax_id          INT REFERENCES taxes(id)
);
CREATE INDEX idx_sublines_sub ON subscription_lines(subscription_id);

-- ---------- Billing (Module 3) & Payments (Module 4) ----------
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED');

CREATE TABLE invoices (
  id              SERIAL PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,             -- e.g. INV-00042
  subscription_id INT NOT NULL REFERENCES subscriptions(id),
  customer_id     INT NOT NULL REFERENCES users(id),
  status          invoice_status NOT NULL DEFAULT 'DRAFT',
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  billable_days   INT NOT NULL DEFAULT 1 CHECK (billable_days > 0),
  period_days     INT NOT NULL DEFAULT 1 CHECK (period_days >= billable_days),
  subtotal        NUMERIC(12,2) NOT NULL,
  discount_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
  applied_discount_ids INT[] NOT NULL DEFAULT '{}', -- so cancelling can give the usage back
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The database itself refuses to bill the same subscription twice for one period
  UNIQUE (subscription_id, period_start)
);
CREATE INDEX idx_inv_status   ON invoices(status);
CREATE INDEX idx_inv_due      ON invoices(due_date);
CREATE INDEX idx_inv_customer ON invoices(customer_id);
CREATE INDEX idx_inv_date     ON invoices(invoice_date);

CREATE TABLE invoice_lines (
  id              SERIAL PRIMARY KEY,
  invoice_id      INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        INT NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount          NUMERIC(12,2) NOT NULL           -- round(qty*unit_price*billable_days/period_days) - discount + tax
);
CREATE INDEX idx_invlines_inv ON invoice_lines(invoice_id);

CREATE TYPE payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'UPI', 'CHEQUE');

CREATE TABLE payments (
  id             SERIAL PRIMARY KEY,
  invoice_id     INT NOT NULL REFERENCES invoices(id),
  method         payment_method NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  date           DATE NOT NULL,
  note           TEXT,
  recorded_by_id INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pay_invoice ON payments(invoice_id);
CREATE INDEX idx_pay_date    ON payments(date);

-- Simple counters for human-friendly numbers (SUB-00001, INV-00001)
CREATE TABLE sequences (
  name  TEXT PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
);
