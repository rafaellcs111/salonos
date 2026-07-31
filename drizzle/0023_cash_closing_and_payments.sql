ALTER TABLE appointments ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN paid_at INTEGER;
ALTER TABLE inventory_sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS cash_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  closing_date TEXT NOT NULL,
  expected_total INTEGER NOT NULL,
  cash_total INTEGER NOT NULL DEFAULT 0,
  pix_total INTEGER NOT NULL DEFAULT 0,
  debit_total INTEGER NOT NULL DEFAULT 0,
  credit_total INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  closed_by TEXT NOT NULL,
  closed_at INTEGER NOT NULL,
  UNIQUE(tenant_id, closing_date)
);
