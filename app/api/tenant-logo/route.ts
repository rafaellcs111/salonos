import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

function mediaBucket() {
  return (env as unknown as { MEDIA: R2Bucket }).MEDIA;
}

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant")?.trim();
  if (!tenantId) return new Response("Barbearia não informada", { status: 400 });
  const tenant = await env.DB.prepare(
    "SELECT logo_key AS logoKey FROM tenants WHERE id = ? AND active = 1 LIMIT 1",
  ).bind(tenantId).first<{ logoKey: string | null }>();
  if (!tenant?.logoKey) return new Response("Logo não cadastrada", { status: 404 });
  const object = await mediaBucket().get(tenant.logoKey);
  if (!object) return new Response("Logo não encontrada", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const requestedTenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(requestedTenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return Response.json({ error: "Selecione uma imagem" }, { status: 400 });
  }
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension || file.size <= 0 || file.size > MAX_LOGO_SIZE) {
    return Response.json(
      { error: "Envie uma imagem PNG, JPG ou WebP com até 2 MB" },
      { status: 400 },
    );
  }
  const current = await env.DB.prepare(
    "SELECT logo_key AS logoKey FROM tenants WHERE id = ? LIMIT 1",
  ).bind(access.tenantId).first<{ logoKey: string | null }>();
  const key = `tenants/${access.tenantId}/logo.${extension}`;
  await mediaBucket().put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  if (current?.logoKey && current.logoKey !== key) {
    await mediaBucket().delete(current.logoKey);
  }
  await env.DB.prepare("UPDATE tenants SET logo_key = ? WHERE id = ?")
    .bind(key, access.tenantId).run();
  return Response.json({
    ok: true,
    logoUrl: `/api/tenant-logo?tenant=${encodeURIComponent(access.tenantId)}&v=${Date.now()}`,
  });
}

export async function DELETE(request: Request) {
  const requestedTenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(requestedTenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  const current = await env.DB.prepare(
    "SELECT logo_key AS logoKey FROM tenants WHERE id = ? LIMIT 1",
  ).bind(access.tenantId).first<{ logoKey: string | null }>();
  if (current?.logoKey) await mediaBucket().delete(current.logoKey);
  await env.DB.prepare("UPDATE tenants SET logo_key = NULL WHERE id = ?")
    .bind(access.tenantId).run();
  return Response.json({ ok: true });
}
