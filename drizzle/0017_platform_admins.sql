CREATE TABLE IF NOT EXISTS `platform_admins` (
  `email` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `created_at` integer NOT NULL
);

