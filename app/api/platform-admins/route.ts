import { env } from "cloudflare:workers";
import { getBarberOSOwner } from "../../chatgpt-auth";
import { recordAuditLog } from "../../audit-log";
import {
  ADDITIONAL_PLATFORM_ADMIN_LIMIT,
  ensurePlatformAdminsTable,
  isPrimaryPlatformOwner,
  PRIMARY_PLATFORM_OWNER_EMAIL,
  PRIMARY_PLATFORM_OWNER_NAME,
} from "../../platform-admins";
import { deleteSupabaseUser, upsertSupabaseUser } from "../../supabase-auth";

export async function GET() {
  const owner = await getBarberOSOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  await ensurePlatformAdminsTable();
  const result = await env.DB.prepare(
    "SELECT email, display_name AS displayName, created_at AS createdAt FROM platform_admins ORDER BY created_at",
  ).all();
  return Response.json({
    limit: ADDITIONAL_PLATFORM_ADMIN_LIMIT,
    admins: [
      {
        email: PRIMARY_PLATFORM_OWNER_EMAIL,
        displayName: PRIMARY_PLATFORM_OWNER_NAME,
        primary: true,
        current: isPrimaryPlatformOwner(owner.email),
      },
      ...result.results.map((admin) => ({
        ...admin,
        primary: false,
        current: String(admin.email).toLowerCase() === owner.email.toLowerCase(),
      })),
    ],
  });
}

export async function POST(request: Request) {
  const owner = await getBarberOSOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  const body = await request.json() as { email?: string; displayName?: string; password?: string };
  const email = String(body.email || "").trim().toLowerCase();
  const displayName = String(body.displayName || "").trim();
  const password = String(body.password || "");
  if (!displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return Response.json({ error: "Informe nome, e-mail válido e senha com pelo menos 8 caracteres" }, { status: 400 });
  }
  if (isPrimaryPlatformOwner(email)) {
    return Response.json({ error: "A conta principal já possui acesso permanente" }, { status: 409 });
  }
  await ensurePlatformAdminsTable();
  const existing = await env.DB.prepare(
    "SELECT email FROM platform_admins WHERE lower(email) = lower(?) LIMIT 1",
  ).bind(email).first();
  if (!existing) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM platform_admins").first<{ total: number }>();
    if (Number(count?.total || 0) >= ADDITIONAL_PLATFORM_ADMIN_LIMIT) {
      return Response.json({ error: "O limite de 2 administradores gerais adicionais foi atingido" }, { status: 409 });
    }
  }
  const tenantAccess = await env.DB.prepare(
    "SELECT id FROM tenants WHERE lower(owner_email) = lower(?) LIMIT 1",
  ).bind(email).first();
  const staffAccess = await env.DB.prepare(
    "SELECT id FROM barbers WHERE lower(email) = lower(?) AND access_enabled = 1 LIMIT 1",
  ).bind(email).first();
  if (tenantAccess || staffAccess) {
    return Response.json({ error: "Este e-mail já está vinculado a um estabelecimento" }, { status: 409 });
  }
  try {
    await upsertSupabaseUser(email, password, displayName);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO platform_admins (email, display_name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name`,
      ).bind(email, displayName, Date.now()),
      env.DB.prepare("DELETE FROM salonos_sessions WHERE lower(email) = lower(?)").bind(email),
    ]);
    await recordAuditLog({
      tenantId: null,
      tenantName: "SalonOS",
      action: existing ? "platform_admin_updated" : "platform_admin_created",
      category: "access",
      description: existing
        ? `Acesso geral de ${displayName} foi atualizado.`
        : `${displayName} recebeu acesso geral ao SalonOS.`,
      actorEmail: owner.email,
      metadata: { email },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o acesso geral" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const owner = await getBarberOSOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  const body = await request.json() as { email?: string };
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || isPrimaryPlatformOwner(email)) {
    return Response.json({ error: "A conta principal não pode ser removida" }, { status: 400 });
  }
  if (email === owner.email.toLowerCase()) {
    return Response.json({ error: "Você não pode remover o próprio acesso" }, { status: 409 });
  }
  await ensurePlatformAdminsTable();
  const admin = await env.DB.prepare(
    "SELECT display_name AS displayName FROM platform_admins WHERE lower(email) = lower(?) LIMIT 1",
  ).bind(email).first<{ displayName: string }>();
  if (!admin) return Response.json({ error: "Administrador não encontrado" }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM platform_admins WHERE lower(email) = lower(?)").bind(email),
    env.DB.prepare("DELETE FROM salonos_sessions WHERE lower(email) = lower(?)").bind(email),
  ]);
  await deleteSupabaseUser(email);
  await recordAuditLog({
    tenantId: null,
    tenantName: "SalonOS",
    action: "platform_admin_removed",
    category: "access",
    description: `O acesso geral de ${admin.displayName} foi removido.`,
    actorEmail: owner.email,
    metadata: { email },
  });
  return Response.json({ ok: true });
}

