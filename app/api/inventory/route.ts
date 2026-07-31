import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

const PAYMENT_METHODS = new Set(["cash", "pix", "debit", "credit"]);

async function requireInventory(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(tenant, "inventory");
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
  const body = await request.json() as { id?: number; delta?: number; action?: string; quantity?: number; paymentMethod?: string };

  if (body.action === "sell") {
    const quantity = Math.floor(Number(body.quantity));
    if (!body.id || !Number.isFinite(quantity) || quantity < 1) {
      return Response.json({ error: "Informe uma quantidade válida" }, { status: 400 });
    }
    if (!body.paymentMethod || !PAYMENT_METHODS.has(body.paymentMethod)) {
      return Response.json({ error: "Informe como o cliente pagou" }, { status: 400 });
    }
    const product = await env.DB.prepare(
      "SELECT id, name, quantity, sale_price AS salePrice FROM inventory_products WHERE id = ? AND tenant_id = ? LIMIT 1",
    ).bind(body.id, access.tenantId).first<{ id: number; name: string; quantity: number; salePrice: number }>();
    if (!product) return Response.json({ error: "Produto não encontrado" }, { status: 404 });
    if (product.quantity < quantity) {
      return Response.json({ error: `Estoque insuficiente. Disponível: ${product.quantity}` }, { status: 409 });
    }
    if (product.salePrice <= 0) {
      return Response.json({ error: "Defina o preço de venda antes de registrar a venda" }, { status: 400 });
    }

    const saleToken = crypto.randomUUID();
    const now = Date.now();
    const saleDate = saoPauloDate();
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO inventory_sales
        (sale_token, tenant_id, product_id, product_name, quantity, unit_price, total_amount, sale_date, sold_at, sold_by, payment_method)
        SELECT ?, tenant_id, id, name, ?, sale_price, sale_price * ?, ?, ?, ?, ?
        FROM inventory_products WHERE id = ? AND tenant_id = ? AND quantity >= ?`)
        .bind(saleToken, quantity, quantity, saleDate, now, access.user.email, body.paymentMethod, body.id, access.tenantId, quantity),
      env.DB.prepare(`UPDATE inventory_products SET quantity = quantity - ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
          AND EXISTS (SELECT 1 FROM inventory_sales WHERE sale_token = ?)`)
        .bind(quantity, now, body.id, access.tenantId, saleToken),
    ]);
    if (!results[0].meta.changes) {
      return Response.json({ error: "Estoque insuficiente para concluir a venda" }, { status: 409 });
    }
    return Response.json({
      ok: true,
      sale: { productName: product.name, quantity, total: product.salePrice * quantity },
    });
  }

  if (!body.id || !Number.isFinite(Number(body.delta))) {
    return Response.json({ error: "Ajuste inválido" }, { status: 400 });
  }
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

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
