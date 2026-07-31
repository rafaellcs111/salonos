import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

async function ensureTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      cpf TEXT NOT NULL DEFAULT '',
      barber TEXT NOT NULL,
      service TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      duration INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_phone_unique ON clients (tenant_id, phone)"),
  ]);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"), "clients");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  await ensureTables();

  const phone = url.searchParams.get("phone")?.trim();
  if (phone) {
    const history = await env.DB.prepare(
      `SELECT id, customer_name AS customerName, phone, barber, service, date, time, status,
        COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0) AS price
       FROM appointments
       WHERE tenant_id = ? AND phone = ?
       ORDER BY date DESC, time DESC`,
    ).bind(access.tenantId, phone).all();
    return Response.json({ history: history.results });
  }

  const clients = await env.DB.prepare(
    `WITH client_base AS (
      SELECT phone, name FROM clients WHERE tenant_id = ?
      UNION
      SELECT phone, MAX(customer_name) AS name FROM appointments
      WHERE tenant_id = ? AND phone != '-' AND status != 'cancelled'
      GROUP BY phone
    )
    SELECT
      client_base.phone,
      client_base.name,
      COUNT(appointments.id) AS appointments,
      SUM(CASE WHEN appointments.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      MAX(appointments.date) AS lastVisit,
      COALESCE(MIN(appointments.date), date('now')) AS firstVisit,
      ROUND(SUM(CASE WHEN appointments.status = 'completed' THEN COALESCE(
        (SELECT price FROM services s
         WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
         ORDER BY s.id DESC LIMIT 1), 0) ELSE 0 END), 2) AS totalSpent
     FROM client_base
     LEFT JOIN appointments ON appointments.tenant_id = ? AND appointments.phone = client_base.phone
       AND appointments.status != 'cancelled'
     GROUP BY client_base.phone, client_base.name
     ORDER BY lastVisit DESC, name`,
  ).bind(access.tenantId, access.tenantId, access.tenantId).all();
  return Response.json({ clients: clients.results });
}

export async function POST(request: Request) {
  const body = await request.json() as { tenant?: string; name?: string; phone?: string };
  const access = await getTenantAccess(body.tenant, "clients");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  await ensureTables();
  const name = String(body.name || "").trim().slice(0, 100);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (name.length < 2 || phone.length < 8) {
    return Response.json({ error: "Informe o nome e um telefone válido" }, { status: 400 });
  }
  await env.DB.prepare(
    `INSERT INTO clients (tenant_id, name, phone, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, phone) DO UPDATE SET name = excluded.name`,
  ).bind(access.tenantId, name, phone, Date.now()).run();
  return Response.json({ ok: true }, { status: 201 });
}
