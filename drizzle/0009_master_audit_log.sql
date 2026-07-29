CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tenant_id` text,
  `tenant_name` text NOT NULL,
  `action` text NOT NULL,
  `category` text NOT NULL,
  `description` text NOT NULL,
  `actor_email` text NOT NULL,
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);
CREATE INDEX IF NOT EXISTS `audit_logs_tenant_idx` ON `audit_logs` (`tenant_id`);
