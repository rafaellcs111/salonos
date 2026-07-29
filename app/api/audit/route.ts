import { env } from "cloudflare:workers";
import { ensureAuditLogTable } from "../../audit-log";
import { getBarberOSOwner } from "../../chatgpt-auth";

export async function GET(request: Request) {
  if (!await getBarberOSOwner()) {
    return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  }
  await ensureAuditLogTable();
  const params = new URL(request.url).searchParams;
  const tenant = params.get("tenant") || "";
  const category = params.get("category") || "";
  const result = await env.DB.prepare(
    `SELECT id, tenant_id AS tenantId, tenant_name AS tenantName, action, category,
      description, actor_email AS actorEmail, metadata, created_at AS createdAt
     FROM audit_logs
     WHERE (? = '' OR tenant_id = ?) AND (? = '' OR category = ?)
     ORDER BY created_at DESC LIMIT 250`,
  ).bind(tenant, tenant, category, category).all();
  return Response.json({ logs: result.results });
}
