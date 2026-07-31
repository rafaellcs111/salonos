CREATE TABLE IF NOT EXISTS inventory_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_token TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  sale_date TEXT NOT NULL,
  sold_at INTEGER NOT NULL,
  sold_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS inventory_sales_tenant_date_idx
ON inventory_sales (tenant_id, sale_date);

ALTER TABLE clients ADD COLUMN is_monthly INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN recurring_weekday INTEGER;
ALTER TABLE clients ADD COLUMN recurring_time TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN recurring_barber TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN recurring_service TEXT NOT NULL DEFAULT '';

ALTER TABLE appointments ADD COLUMN recurring_client_id INTEGER;

CREATE INDEX IF NOT EXISTS appointments_recurring_client_idx
ON appointments (tenant_id, recurring_client_id, date);
