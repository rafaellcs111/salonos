import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";
import { whatsappConfigured } from "../../whatsapp";

export async function GET(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(tenant, "settings");
  if (!access || access.role === "staff") {
    return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    event TEXT NOT NULL,
    recipient TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting_configuration',
    created_at INTEGER NOT NULL,
    sent_at INTEGER
  )`).run();
  const queue = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM whatsapp_outbox
     WHERE tenant_id = ? AND status IN ('pending', 'waiting_configuration')`,
  ).bind(access.tenantId).first<{ total: number }>();
  return Response.json({
    connected: whatsappConfigured(),
    queuedMessages: Number(queue?.total || 0),
    provider: "Meta WhatsApp Cloud API",
  });
}
