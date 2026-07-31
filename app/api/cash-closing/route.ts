import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

const METHODS = ["cash", "pix", "debit", "credit"] as const;

async function ensureCashTables() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS cash_closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL,
    closing_date TEXT NOT NULL, expected_total INTEGER NOT NULL,
    cash_total INTEGER NOT NULL DEFAULT 0, pix_total INTEGER NOT NULL DEFAULT 0,
    debit_total INTEGER NOT NULL DEFAULT 0, credit_total INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '', closed_by TEXT NOT NULL, closed_at INTEGER NOT NULL,
    UNIQUE(tenant_id, closing_date)
  )`).run();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"), "finance");
  if (!access || access.role === "staff") return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  const date = url.searchParams.get("date") || saoPauloDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Data inválida" }, { status: 400 });
  await ensureCashTables();
  const [services, products, closing] = await Promise.all([
    env.DB.prepare(`SELECT payment_method AS paymentMethod,
      ROUND(SUM(COALESCE((SELECT price FROM services s WHERE s.tenant_id = appointments.tenant_id
        AND s.name = appointments.service ORDER BY s.id DESC LIMIT 1), 0)) * 100) AS total
      FROM appointments WHERE tenant_id = ? AND date = ? AND status = 'completed'
      GROUP BY payment_method`).bind(access.tenantId, date).all(),
    env.DB.prepare(`SELECT payment_method AS paymentMethod, SUM(total_amount) AS total
      FROM inventory_sales WHERE tenant_id = ? AND sale_date = ? GROUP BY payment_method`)
      .bind(access.tenantId, date).all(),
    env.DB.prepare(`SELECT id, expected_total AS expectedTotal, cash_total AS cashTotal,
      pix_total AS pixTotal, debit_total AS debitTotal, credit_total AS creditTotal,
      notes, closed_by AS closedBy, closed_at AS closedAt
      FROM cash_closings WHERE tenant_id = ? AND closing_date = ? LIMIT 1`)
      .bind(access.tenantId, date).first(),
  ]);
  const totals = Object.fromEntries(METHODS.map((method) => [method, 0])) as Record<string, number>;
  for (const item of [...services.results, ...products.results]) {
    const method = String(item.paymentMethod || "");
    if (method in totals) totals[method] += Number(item.total || 0);
  }
  return Response.json({ date, totals, expectedTotal: Object.values(totals).reduce((sum, value) => sum + value, 0), closing: closing || null });
}

export async function POST(request: Request) {
  const body = await request.json() as { tenant?: string; date?: string; notes?: string };
  const access = await getTenantAccess(body.tenant, "finance");
  if (!access || access.role === "staff") return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  const date = body.date || saoPauloDate();
  await ensureCashTables();
  const response = await GET(new Request(`https://salonos.local/api/cash-closing?tenant=${encodeURIComponent(access.tenantId)}&date=${date}`, { headers: request.headers }));
  if (!response.ok) return response;
  const summary = await response.json() as { expectedTotal: number; totals: Record<string, number> };
  await env.DB.prepare(`INSERT INTO cash_closings
    (tenant_id, closing_date, expected_total, cash_total, pix_total, debit_total, credit_total, notes, closed_by, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, closing_date) DO UPDATE SET expected_total = excluded.expected_total,
      cash_total = excluded.cash_total, pix_total = excluded.pix_total, debit_total = excluded.debit_total,
      credit_total = excluded.credit_total, notes = excluded.notes, closed_by = excluded.closed_by, closed_at = excluded.closed_at`)
    .bind(access.tenantId, date, summary.expectedTotal, summary.totals.cash, summary.totals.pix,
      summary.totals.debit, summary.totals.credit, String(body.notes || "").trim().slice(0, 500), access.user.email, Date.now()).run();
  return Response.json({ ok: true });
}

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
