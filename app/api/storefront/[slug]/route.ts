import { env } from "cloudflare:workers";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const tenantResult = await env.DB.prepare(
    `SELECT id, name, slug, city, phone, logo_key AS logoKey,
      business_type AS businessType, theme
     FROM tenants WHERE slug = ? AND active = 1 LIMIT 1`,
  ).bind(slug).all();
  const tenant = tenantResult.results[0];
  if (!tenant) return Response.json({ error: "Barbearia indisponível" }, { status: 404 });

  const [services, barbers, hours] = await Promise.all([
    env.DB.prepare("SELECT name, price, duration FROM services WHERE tenant_id = ? AND active = 1 ORDER BY id").bind(tenant.id).all(),
    env.DB.prepare(`SELECT name, photo_key AS photoKey, services, work_days AS workDays, work_start AS workStart,
      work_end AS workEnd, break_start AS breakStart, break_end AS breakEnd, time_off AS timeOff
      FROM barbers WHERE tenant_id = ? AND active = 1 AND lower(role) != 'caixa' ORDER BY id`).bind(tenant.id).all(),
    env.DB.prepare("SELECT label, days, open, close FROM business_hours WHERE tenant_id = ? AND active = 1 ORDER BY id").bind(tenant.id).all(),
  ]);
  return Response.json({
    tenant: {
      ...tenant,
      logoUrl: tenant.logoKey ? `/api/tenant-logo?tenant=${encodeURIComponent(String(tenant.id))}` : null,
    },
    services: services.results,
    barbers: barbers.results.map((item) => ({
      ...item,
      photoUrl: item.photoKey ? `/api/barber-photo?tenant=${encodeURIComponent(String(tenant.id))}&key=${encodeURIComponent(String(item.photoKey))}` : null,
      services: parseArray(item.services),
      workDays: parseArray(item.workDays),
      timeOff: parseArray(item.timeOff),
    })),
    hours: hours.results,
  });
}

function parseArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
