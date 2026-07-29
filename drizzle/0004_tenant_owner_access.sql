ALTER TABLE `tenants` ADD COLUMN `owner_email` text;
--> statement-breakpoint
UPDATE `tenants`
SET `owner_email` = 'rafaelviamaquinas@gmail.com'
WHERE `id` = 'chosen' AND (`owner_email` IS NULL OR `owner_email` = '');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tenants_owner_email_idx`
ON `tenants` (`owner_email`);
