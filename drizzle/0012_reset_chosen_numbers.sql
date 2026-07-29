DELETE FROM appointments
WHERE tenant_id IN (
  SELECT id FROM tenants WHERE slug = 'chosen'
);
