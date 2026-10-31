-- Existing invoices retain full-period amounts with the default ratio 1/1.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billable_days INT NOT NULL DEFAULT 1 CHECK (billable_days > 0),
  ADD COLUMN IF NOT EXISTS period_days INT NOT NULL DEFAULT 1 CHECK (period_days >= billable_days);
