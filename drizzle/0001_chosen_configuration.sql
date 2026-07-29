CREATE TABLE IF NOT EXISTS `services` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `price` integer NOT NULL,
  `duration` integer NOT NULL,
  `active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `barbers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tenant_id` text NOT NULL,
  `name` text NOT NULL,
  `commission` integer DEFAULT 30 NOT NULL,
  `active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `business_hours` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `tenant_id` text NOT NULL,
  `label` text NOT NULL,
  `days` text NOT NULL,
  `open` text NOT NULL,
  `close` text NOT NULL,
  `active` integer DEFAULT true NOT NULL
);
