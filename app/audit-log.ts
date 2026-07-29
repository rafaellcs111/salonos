import { env } from "cloudflare:workers";

export async function ensureAuditLogTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT,
      tenant_name TEXT NOT NULL,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs (tenant_id)"),
  ]);
}

export async function recordAuditLog(input: {
  tenantId?: string | null;
  tenantName: string;
  action: string;
  category: string;
  description: string;
  actorEmail: string;
  metadata?: Record<string, unknown>;
}) {
  await ensureAuditLogTable();
  await env.DB.prepare(
    `INSERT INTO audit_logs
      (tenant_id, tenant_name, action, category, description, actor_email, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.tenantId || null,
    input.tenantName,
    input.action,
    input.category,
    input.description,
    input.actorEmail.toLowerCase(),
    JSON.stringify(input.metadata || {}),
    Date.now(),
  ).run();
}
