import { env } from "cloudflare:workers";
import { getBarberOSOwner } from "../../../chatgpt-auth";
import { upsertSupabaseUser } from "../../../supabase-auth";
import { getTenantAccess } from "../../../tenant-access";

const TEMPORARY_PASSWORD = "12345678";

export async function POST(request: Request) {
  const body = await request.json() as { tenant?: string; email?: string; password?: string; displayName?: string };
  if (body.password !== undefined) {
    const owner = await getBarberOSOwner();
    if (!owner) return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
    if (!body.email || body.password.length < 8) {
      return Response.json({ error: "Informe um e-mail e uma senha com pelo menos 8 caracteres" }, { status: 400 });
    }
    try {
      await upsertSupabaseUser(body.email, body.password, body.displayName || body.email);
      await env.DB.prepare("DELETE FROM salonos_sessions WHERE lower(email) = lower(?)")
        .bind(body.email).run();
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a senha" }, { status: 400 });
    }
  }
  const access = await getTenantAccess(body.tenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito ao gestor" }, { status: 403 });
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Informe um e-mail válido para o profissional" }, { status: 400 });
  }
  const professional = await env.DB.prepare(
    "SELECT id, name, active FROM barbers WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1",
  ).bind(access.tenantId, email).first<{ id: number; name: string; active: number }>();
  if (!professional) {
    return Response.json({ error: "Salve o e-mail do profissional antes de criar o acesso" }, { status: 409 });
  }
  if (!professional.active) {
    return Response.json({ error: "Ative o profissional antes de liberar o acesso" }, { status: 409 });
  }
  const conflictingOwner = await env.DB.prepare(
    "SELECT id FROM tenants WHERE lower(owner_email) = lower(?) LIMIT 1",
  ).bind(email).first();
  const conflictingStaff = await env.DB.prepare(
    "SELECT id FROM barbers WHERE lower(email) = lower(?) AND tenant_id != ? AND access_enabled = 1 LIMIT 1",
  ).bind(email, access.tenantId).first();
  if (conflictingOwner || conflictingStaff) {
    return Response.json({ error: "Este e-mail já está vinculado a outro acesso" }, { status: 409 });
  }
  try {
    await upsertSupabaseUser(email, TEMPORARY_PASSWORD, professional.name);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE barbers SET access_enabled = 1, access_must_change = 1 WHERE id = ? AND tenant_id = ?",
      ).bind(professional.id, access.tenantId),
      env.DB.prepare("DELETE FROM salonos_sessions WHERE lower(email) = lower(?)").bind(email),
    ]);
    return Response.json({ ok: true, temporaryPassword: TEMPORARY_PASSWORD });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o acesso" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const body = await request.json() as { tenant?: string; email?: string };
  const access = await getTenantAccess(body.tenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito ao gestor" }, { status: 403 });
  const email = String(body.email || "").trim().toLowerCase();
  const professional = await env.DB.prepare(
    "SELECT id FROM barbers WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1",
  ).bind(access.tenantId, email).first<{ id: number }>();
  if (!professional) return Response.json({ error: "Profissional não encontrado" }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE barbers SET access_enabled = 0, access_must_change = 0 WHERE id = ? AND tenant_id = ?",
    ).bind(professional.id, access.tenantId),
    env.DB.prepare("DELETE FROM salonos_sessions WHERE lower(email) = lower(?)").bind(email),
  ]);
  return Response.json({ ok: true });
}
