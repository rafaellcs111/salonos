import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

async function ensureTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
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
    `SELECT
      phone,
      MAX(customer_name) AS name,
      COUNT(*) AS appointments,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      MAX(date) AS lastVisit,
      MIN(date) AS firstVisit,
      ROUND(SUM(CASE WHEN status = 'completed' THEN COALESCE(
        (SELECT price FROM services s
         WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
         ORDER BY s.id DESC LIMIT 1), 0) ELSE 0 END), 2) AS totalSpent
     FROM appointments
     WHERE tenant_id = ? AND status != 'cancelled'
     GROUP BY phone
     ORDER BY lastVisit DESC, name`,
  ).bind(access.tenantId).all();
  return Response.json({ clients: clients.results });
}
