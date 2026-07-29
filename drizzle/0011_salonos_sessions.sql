CREATE TABLE IF NOT EXISTS `salonos_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `salonos_sessions_email_idx` ON `salonos_sessions` (`email`);
