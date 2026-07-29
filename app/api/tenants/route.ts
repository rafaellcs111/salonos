import { env } from "cloudflare:workers";
import { recordAuditLog } from "../../audit-log";
import { getBarberOSOwner } from "../../chatgpt-auth";
import { deleteSupabaseUser } from "../../supabase-auth";

async function requireOwner() {
  return getBarberOSOwner();
}

export async function GET() {
  if (!await requireOwner()) return Response.json({ error: "Acesso restrito ao proprietÃ¡rio" }, { status: 403 });
  const result = await env.DB.prepare(
    `SELECT t.id, t.name, t.slug, t.city, t.phone, t.owner_email AS ownerEmail,
      t.business_type AS businessType, t.theme,
      t.logo_key AS logoKey, t.active, t.plan,
      COUNT(a.id) AS appointments,
      MAX(a.date) AS lastAppointment
     FROM tenants t LEFT JOIN appointments a ON a.tenant_id = t.id
     GROUP BY t.id ORDER BY t.created_at DESC`,
  ).all();
  return Response.json({ tenants: result.results.map((item) => ({
    ...item,
    active: Boolean(item.active),
    logoUrl: item.logoKey ? `/api/tenant-logo?tenant=${encodeURIComponent(String(item.id))}` : null,
  })) });
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietÃ¡rio" }, { status: 403 });
  const body = await request.json() as Record<string, string | boolean>;
  const slug = String(body.slug || body.name || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  const name = String(body.name || "").trim();
  const city = String(body.city || "").trim();
  const phone = String(body.phone || "").trim();
  const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
  const plan = ["starter", "pro", "premium"].includes(String(body.plan)) ? String(body.plan) : "pro";
  const businessType = body.businessType === "salon" ? "salon" : "barbershop";
  const theme = body.theme === "white" ? "white" : "black";
  const active = body.active === false ? 0 : 1;
  if (!name || slug.length < 3 || !city || !phone || !ownerEmail) {
    return Response.json({ error: "Preencha nome, cidade, telefone, e-mail do responsÃ¡vel e um endereÃ§o vÃ¡lido" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return Response.json({ error: "Informe um e-mail vÃ¡lido para o responsÃ¡vel" }, { status: 400 });
  }
  try {
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tenants (id, name, slug, city, phone, owner_email, business_type, theme, active, plan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, name, slug, city, phone, ownerEmail, businessType, theme, active, plan, Date.now()),
      env.DB.prepare(
        `INSERT INTO services (tenant_id, name, price, duration, active)
         VALUES (?, 'Corte', 50, 50, 1)`,
      ).bind(id),
      env.DB.prepare(
        `INSERT INTO business_hours (tenant_id, label, days, open, close, active)
         VALUES (?, 'TerÃ§a a sexta', '2,3,4,5', '10:00', '20:00', 1)`,
      ).bind(id),
    ]);
    await recordAuditLog({
      tenantId: id,
      tenantName: name,
      action: "company_created",
      category: "company",
      description: `Empresa ${name} criada e ${active ? "ativada" : "salva como rascunho"}.`,
      actorEmail: owner.email,
      metadata: { plan, slug, active: Boolean(active), ownerEmail, businessType, theme },
    });
    return Response.json({ ok: true, id, slug }, { status: 201 });
  } catch {
    return Response.json({ error: "Esse endereÃ§o pÃºblico jÃ¡ estÃ¡ em uso" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const owner = await requireOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietÃ¡rio" }, { status: 403 });
  const body = await request.json() as {
    id?: string;
    name?: string;
    city?: string;
    phone?: string;
    ownerEmail?: string;
    active?: boolean;
    plan?: string;
    businessType?: string;
    theme?: string;
  };
  if (!body.id) {
    return Response.json({ error: "AtualizaÃ§Ã£o invÃ¡lida" }, { status: 400 });
  }
  const current = await env.DB.prepare(
    "SELECT name, city, phone, owner_email AS ownerEmail, business_type AS businessType, theme, active, plan FROM tenants WHERE id = ? LIMIT 1",
  ).bind(body.id).first<Record<string, string | number | null>>();
  if (!current) return Response.json({ error: "Barbearia nÃ£o encontrada" }, { status: 404 });

  const ownerEmail = body.ownerEmail === undefined
    ? String(current.ownerEmail || "")
    : body.ownerEmail.trim().toLowerCase();
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return Response.json({ error: "Informe um e-mail vÃ¡lido para o responsÃ¡vel" }, { status: 400 });
  }
  const plan = body.plan || String(current.plan);
  if (!["starter", "pro", "premium"].includes(plan)) {
    return Response.json({ error: "Plano invÃ¡lido" }, { status: 400 });
  }
  const businessType = body.businessType === undefined ? String(current.businessType) : body.businessType;
  const theme = body.theme === undefined ? String(current.theme) : body.theme;
  if (!["salon", "barbershop"].includes(businessType) || !["black", "white"].includes(theme)) {
    return Response.json({ error: "Tipo de empresa ou tema invÃ¡lido" }, { status: 400 });
  }
  await env.DB.prepare(
    `UPDATE tenants SET name = ?, city = ?, phone = ?, owner_email = ?, business_type = ?, theme = ?, active = ?, plan = ?
     WHERE id = ?`,
  ).bind(
    body.name?.trim() || current.name,
    body.city?.trim() || current.city,
    body.phone?.trim() || current.phone,
    ownerEmail || null,
    businessType,
    theme,
    body.active === undefined ? Number(current.active) : body.active ? 1 : 0,
    plan,
    body.id,
  ).run();
  const nextName = body.name?.trim() || String(current.name);
  const changes: string[] = [];
  if (body.plan && body.plan !== current.plan) changes.push(`plano alterado de ${current.plan} para ${plan}`);
  if (body.active !== undefined && Number(current.active) !== (body.active ? 1 : 0)) changes.push(body.active ? "empresa ativada" : "empresa desativada");
  if (body.ownerEmail !== undefined && ownerEmail !== String(current.ownerEmail || "")) changes.push("gestor responsÃ¡vel alterado");
  if (body.name?.trim() && body.name.trim() !== current.name) changes.push(`nome alterado para ${body.name.trim()}`);
  if (body.city?.trim() && body.city.trim() !== current.city) changes.push("cidade atualizada");
  if (body.phone?.trim() && body.phone.trim() !== current.phone) changes.push("WhatsApp atualizado");
  if (body.businessType !== undefined && businessType !== current.businessType) changes.push(`tipo alterado para ${businessType === "salon" ? "salÃ£o" : "barbearia"}`);
  if (body.theme !== undefined && theme !== current.theme) changes.push(`tema alterado para ${theme === "white" ? "White" : "Black"}`);
  if (changes.length) {
    const category = body.plan && body.plan !== current.plan ? "plan"
      : body.active !== undefined && Number(current.active) !== (body.active ? 1 : 0) ? "status"
      : body.ownerEmail !== undefined && ownerEmail !== String(current.ownerEmail || "") ? "access"
      : "company";
    await recordAuditLog({
      tenantId: body.id,
      tenantName: nextName,
      action: "company_updated",
      category,
      description: changes.join("; ") + ".",
      actorEmail: owner.email,
      metadata: { changes, plan, active: body.active, ownerEmail, businessType, theme },
    });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const owner = await requireOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietÃ¡rio" }, { status: 403 });
  const body = await request.json().catch(() => null) as { id?: string } | null;
  if (!body?.id) return Response.json({ error: "Estabelecimento nÃ£o informado" }, { status: 400 });

  const tenant = await env.DB.prepare(
    "SELECT name, owner_email AS ownerEmail, logo_key AS logoKey FROM tenants WHERE id = ? LIMIT 1",
  ).bind(body.id).first<{ name: string; ownerEmail: string | null; logoKey: string | null }>();
  if (!tenant) return Response.json({ error: "Estabelecimento nÃ£o encontrado" }, { status: 404 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM appointments WHERE tenant_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM services WHERE tenant_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM barbers WHERE tenant_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM business_hours WHERE tenant_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM inventory_products WHERE tenant_id = ?").bind(body.id),
    env.DB.prepare("DELETE FROM tenants WHERE id = ?").bind(body.id),
  ]);
  if (tenant.logoKey) {
    const media = (env as unknown as { MEDIA: R2Bucket }).MEDIA;
    await media.delete(tenant.logoKey);
  }
  if (tenant.ownerEmail) {
    await env.DB.prepare("DELETE FROM salonos_sessions WHERE email = ?")
      .bind(tenant.ownerEmail.toLowerCase()).run();
    const otherTenant = await env.DB.prepare(
      "SELECT id FROM tenants WHERE lower(owner_email) = lower(?) LIMIT 1",
    ).bind(tenant.ownerEmail).first();
    if (!otherTenant && tenant.ownerEmail.toLowerCase() !== owner.email.toLowerCase()) {
      try {
        await deleteSupabaseUser(tenant.ownerEmail);
      } catch {
        // The establishment is already removed; do not report a failed deletion
        // if the external credential cleanup is temporarily unavailable.
      }
    }
  }
  await recordAuditLog({
    tenantName: tenant.name,
    action: "company_deleted",
    category: "company",
    description: `Estabelecimento ${tenant.name} excluÃ­do da plataforma.`,
    actorEmail: owner.email,
  });
  return Response.json({ ok: true });
}

