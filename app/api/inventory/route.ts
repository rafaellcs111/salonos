import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

async function requireInventory(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(tenant, "settings");
  return access && access.plan !== "starter" ? access : null;
}

export async function GET(request: Request) {
  const access = await requireInventory(request);
  if (!access) return Response.json({ error: "Estoque disponível nos planos Pro e Premium" }, { status: 403 });
  const result = await env.DB.prepare(
    `SELECT id, name, category, quantity, minimum_stock AS minimumStock,
      cost, sale_price AS salePrice, updated_at AS updatedAt
     FROM inventory_products WHERE tenant_id = ? ORDER BY name`,
  ).bind(access.tenantId).all();
  return Response.json({ products: result.results });
}

export async function POST(request: Request) {
  const access = await requireInventory(request);
  if (!access) return Response.json({ error: "Estoque disponível nos planos Pro e Premium" }, { status: 403 });
  const body = await request.json() as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "Informe o nome do produto" }, { status: 400 });
  await env.DB.prepare(
    `INSERT INTO inventory_products
      (tenant_id, name, category, quantity, minimum_stock, cost, sale_price, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(access.tenantId, name, String(body.category || "Geral").trim(), Math.max(0, Number(body.quantity) || 0),
    Math.max(0, Number(body.minimumStock) || 0), Math.round((Number(body.cost) || 0) * 100),
    Math.round((Number(body.salePrice) || 0) * 100), Date.now()).run();
  return Response.json({ ok: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await requireInventory(request);
  if (!access) return Response.json({ error: "Estoque disponível nos planos Pro e Premium" }, { status: 403 });
  const body = await request.json() as { id?: number; delta?: number };
  if (!body.id || !Number.isFinite(Number(body.delta))) return Response.json({ error: "Ajuste inválido" }, { status: 400 });
  await env.DB.prepare(
    "UPDATE inventory_products SET quantity = MAX(0, quantity + ?), updated_at = ? WHERE id = ? AND tenant_id = ?",
  ).bind(Number(body.delta), Date.now(), body.id, access.tenantId).run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await requireInventory(request);
  if (!access) return Response.json({ error: "Estoque disponível nos planos Pro e Premium" }, { status: 403 });
  const body = await request.json() as { id?: number };
  await env.DB.prepare("DELETE FROM inventory_products WHERE id = ? AND tenant_id = ?")
    .bind(body.id || 0, access.tenantId).run();
  return Response.json({ ok: true });
}
