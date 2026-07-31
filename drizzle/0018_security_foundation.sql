ALTER TABLE barbers ADD COLUMN temporary_password_hash TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT NOT NULL,
  namespace TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (key_hash, window_started_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rate_limits_expires_at_idx
ON rate_limits (expires_at);
