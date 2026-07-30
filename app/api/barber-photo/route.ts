import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

const MAX_PHOTO_SIZE = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

function mediaBucket() {
  return (env as unknown as { MEDIA: R2Bucket }).MEDIA;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant")?.trim() || "";
  const key = url.searchParams.get("key")?.trim() || "";
  if (!tenantId || !key.startsWith(`barbers/${tenantId}/`)) {
    return new Response("Foto inválida", { status: 400 });
  }
  const tenant = await env.DB.prepare(
    "SELECT id FROM tenants WHERE id = ? AND active = 1 LIMIT 1",
  ).bind(tenantId).first();
  if (!tenant) return new Response("Estabelecimento indisponível", { status: 404 });
  const object = await mediaBucket().get(key);
  if (!object) return new Response("Foto não encontrada", { status: 404 });
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
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ error: "Selecione uma foto" }, { status: 400 });
  }
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension || file.size <= 0 || file.size > MAX_PHOTO_SIZE) {
    return Response.json(
      { error: "Envie uma foto PNG, JPG ou WebP com até 3 MB" },
      { status: 400 },
    );
  }
  const currentKey = String(form.get("currentKey") || "");
  const validCurrentKey = currentKey.startsWith(`barbers/${access.tenantId}/`) ? currentKey : "";
  const key = `barbers/${access.tenantId}/${crypto.randomUUID()}.${extension}`;
  await mediaBucket().put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  if (validCurrentKey) {
    await env.DB.prepare(
      "UPDATE barbers SET photo_key = ? WHERE tenant_id = ? AND photo_key = ?",
    ).bind(key, access.tenantId, validCurrentKey).run();
    await mediaBucket().delete(validCurrentKey);
  }
  return Response.json({
    ok: true,
    photoKey: key,
    photoUrl: `/api/barber-photo?tenant=${encodeURIComponent(access.tenantId)}&key=${encodeURIComponent(key)}&v=${Date.now()}`,
  });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const requestedTenant = url.searchParams.get("tenant");
  const access = await getTenantAccess(requestedTenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  const key = url.searchParams.get("key")?.trim() || "";
  if (!key.startsWith(`barbers/${access.tenantId}/`)) {
    return Response.json({ error: "Foto inválida" }, { status: 400 });
  }
  await mediaBucket().delete(key);
  await env.DB.prepare(
    "UPDATE barbers SET photo_key = NULL WHERE tenant_id = ? AND photo_key = ?",
  ).bind(access.tenantId, key).run();
  return Response.json({ ok: true });
}
