ALTER TABLE `tenants` ADD COLUMN `active` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `tenants` ADD COLUMN `plan` text DEFAULT 'pro' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `tenants` (`id`, `name`, `slug`, `city`, `phone`, `active`, `plan`, `created_at`)
VALUES ('chosen', 'Chosen Barbearia', 'chosen', 'Camboriú · SC', '(47) 9 9927-0340', 1, 'pro', unixepoch() * 1000);
