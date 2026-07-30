ALTER TABLE barbers ADD COLUMN access_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE barbers ADD COLUMN access_must_change INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS barbers_tenant_email_access_idx
ON barbers (tenant_id, email, access_enabled);
