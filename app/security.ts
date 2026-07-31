import { env } from "cloudflare:workers";

type RateLimitOptions = {
  namespace: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit({
  namespace,
  identifier,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  const keyHash = await sha256(`${namespace}:${identifier.trim().toLowerCase()}`);

  await ensureRateLimitTable();
  await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run();
  const record = await env.DB.prepare(
    `INSERT INTO rate_limits (key_hash, namespace, window_started_at, request_count, expires_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(key_hash, window_started_at)
     DO UPDATE SET request_count = request_count + 1
     RETURNING request_count AS requestCount`,
  ).bind(keyHash, namespace, windowStartedAt, windowStartedAt + windowMs).first<{ requestCount: number }>();

  const requestCount = Number(record?.requestCount || 1);
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000));
  return {
    allowed: requestCount <= limit,
    remaining: Math.max(0, limit - requestCount),
    retryAfterSeconds,
  };
}

export function rateLimitResponse(result: RateLimitResult, message: string) {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}

export function requestClientAddress(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || request.headers.get("x-real-ip");
  return forwarded?.trim() || "unknown";
}

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const random = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `S!${random}`;
}

export function temporaryPasswordHash(password: string) {
  return sha256(`salonos-temporary-password:${password}`);
}

async function ensureRateLimitTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key_hash TEXT NOT NULL,
      namespace TEXT NOT NULL,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      PRIMARY KEY (key_hash, window_started_at)
    )`,
  ).run();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
