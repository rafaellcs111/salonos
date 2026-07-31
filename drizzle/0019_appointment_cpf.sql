ALTER TABLE appointments ADD COLUMN cpf TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS appointments_tenant_cpf_idx
ON appointments (tenant_id, cpf);
