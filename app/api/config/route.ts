import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

async function ensureTables() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      price REAL NOT NULL, duration INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'Barbeiro',
      commission REAL NOT NULL DEFAULT 30, services TEXT NOT NULL DEFAULT '[]',
      work_days TEXT NOT NULL DEFAULT '["2","3","4","5","6"]',
      work_start TEXT NOT NULL DEFAULT '09:00', work_end TEXT NOT NULL DEFAULT '18:00',
      break_start TEXT NOT NULL DEFAULT '', break_end TEXT NOT NULL DEFAULT '',
      time_off TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '{"agenda":true,"clients":true,"finance":false,"settings":false}',
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS business_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, label TEXT NOT NULL,
      days TEXT NOT NULL, open TEXT NOT NULL, close TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    )`),
  ]);
}

export async function GET(request: Request) {
  await ensureTables();
  const tenant = new URL(request.url).searchParams.get("tenant") || "chosen";
  const settingsAccess = await getTenantAccess(tenant, "settings");
  if (!settingsAccess) {
    return Response.json({ error: "Acesso restrito a este estabelecimento" }, { status: 403 });
  }
  const [services, barbers, hours] = await Promise.all([
    env.DB.prepare("SELECT name, price, duration, active FROM services WHERE tenant_id = ? ORDER BY id").bind(tenant).all(),
    env.DB.prepare(`SELECT name, email, phone, role, commission, services, work_days AS workDays,
      work_start AS workStart, work_end AS workEnd, break_start AS breakStart,
      break_end AS breakEnd, time_off AS timeOff, permissions, active
      FROM barbers WHERE tenant_id = ? ORDER BY id`).bind(tenant).all(),
    env.DB.prepare("SELECT label, days, open, close, active FROM business_hours WHERE tenant_id = ? ORDER BY id").bind(tenant).all(),
  ]);
  return Response.json({
    services: services.results.length ? services.results.map((x) => ({ ...x, active: Boolean(x.active) })) : [{ name: "Corte", price: 50, duration: 50, active: true }],
    barbers: barbers.results.length ? barbers.results.map((x) => settingsAccess ? ({
        ...x,
        services: safeJsonArray(x.services),
        workDays: safeJsonArray(x.workDays),
        timeOff: safeTimeOff(x.timeOff),
        permissions: safePermissions(x.permissions),
        active: Boolean(x.active),
      }) : ({
        name: x.name,
        commission: Number(x.commission || 0),
        services: safeJsonArray(x.services),
        workDays: safeJsonArray(x.workDays),
        workStart: x.workStart,
        workEnd: x.workEnd,
        breakStart: x.breakStart,
        breakEnd: x.breakEnd,
        timeOff: safeTimeOff(x.timeOff),
        active: Boolean(x.active),
      })) : [
      { name: "Thiago", email: "", phone: "", role: "Barbeiro", commission: 30, services: ["Corte"], workDays: ["2", "3", "4", "5", "6"], workStart: "10:00", workEnd: "20:00", breakStart: "12:00", breakEnd: "13:00", timeOff: [], permissions: { agenda: true, clients: true, finance: false, settings: false }, active: true },
      { name: "Dav", email: "", phone: "", role: "Barbeiro", commission: 30, services: ["Corte"], workDays: ["2", "3", "4", "5", "6"], workStart: "10:00", workEnd: "20:00", breakStart: "12:00", breakEnd: "13:00", timeOff: [], permissions: { agenda: true, clients: true, finance: false, settings: false }, active: true },
    ],
    hours: hours.results.length ? hours.results.map((x) => ({ ...x, active: Boolean(x.active) })) : [{ label: "TerÃ§a a sexta", days: "2,3,4,5", open: "10:00", close: "20:00", active: true }, { label: "SÃ¡bado", days: "6", open: "09:00", close: "17:00", active: true }],
  });
}

export async function POST(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(tenant, "settings");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  await ensureTables();
  const data = await request.json() as {
    services: { name: string; price: number; duration: number; active: boolean }[];
    barbers: {
      name: string; email?: string; phone?: string; role?: string; commission: number;
      services?: string[]; workDays?: string[];
      workStart?: string; workEnd?: string; breakStart?: string; breakEnd?: string;
      timeOff?: { start?: string; end?: string; label?: string }[];
      permissions?: { agenda?: boolean; clients?: boolean; finance?: boolean; settings?: boolean };
      active: boolean;
    }[];
    hours: { label: string; days: string; open: string; close: string; active: boolean }[];
  };
  if (!Array.isArray(data.services) || !Array.isArray(data.barbers) || !Array.isArray(data.hours)) {
    return Response.json({ error: "ConfiguraÃ§Ã£o invÃ¡lida" }, { status: 400 });
  }
  const professionalLimit = access.plan === "starter" ? 3 : access.plan === "pro" ? 10 : Number.POSITIVE_INFINITY;
  if (data.barbers.length > professionalLimit) {
    return Response.json(
      { error: `O plano ${access.plan === "starter" ? "Starter" : "Pro"} permite atÃ© ${professionalLimit} profissionais` },
      { status: 403 },
    );
  }
  const statements = [
    env.DB.prepare("DELETE FROM services WHERE tenant_id = ?").bind(access.tenantId),
    env.DB.prepare("DELETE FROM barbers WHERE tenant_id = ?").bind(access.tenantId),
    env.DB.prepare("DELETE FROM business_hours WHERE tenant_id = ?").bind(access.tenantId),
    ...data.services.map((x) => env.DB.prepare("INSERT INTO services (tenant_id, name, price, duration, active) VALUES (?, ?, ?, ?, ?)").bind(access.tenantId, x.name.trim(), x.price, x.duration, x.active ? 1 : 0)),
    ...data.barbers.map((x) => env.DB.prepare(`INSERT INTO barbers
      (tenant_id, name, email, phone, role, commission, services, work_days,
       work_start, work_end, break_start, break_end, time_off, permissions, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        access.tenantId,
        x.name.trim(),
        (x.email || "").trim().toLowerCase(),
        (x.phone || "").trim(),
        (x.role || "Barbeiro").trim(),
        Math.min(100, Math.max(0, Number(x.commission) || 0)),
        JSON.stringify(Array.isArray(x.services) ? x.services : []),
        JSON.stringify(Array.isArray(x.workDays) ? x.workDays : []),
        validTime(x.workStart, "09:00"),
        validTime(x.workEnd, "18:00"),
        validTime(x.breakStart, ""),
        validTime(x.breakEnd, ""),
        JSON.stringify((Array.isArray(x.timeOff) ? x.timeOff : []).filter((period) => period.start && period.end).map((period) => ({
          start: String(period.start).slice(0, 10),
          end: String(period.end).slice(0, 10),
          label: String(period.label || "Folga").trim().slice(0, 50),
        }))),
        JSON.stringify({
          agenda: Boolean(x.permissions?.agenda),
          clients: Boolean(x.permissions?.clients),
          finance: Boolean(x.permissions?.finance),
          settings: Boolean(x.permissions?.settings),
        }),
        x.active ? 1 : 0,
      )),
    ...data.hours.map((x) => env.DB.prepare("INSERT INTO business_hours (tenant_id, label, days, open, close, active) VALUES (?, ?, ?, ?, ?, ?)").bind(access.tenantId, x.label.trim(), x.days, x.open, x.close, x.active ? 1 : 0)),
  ];
  await env.DB.batch(statements);
  return Response.json({ ok: true, updatedBy: access.user.email });
}

function safeJsonArray(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safePermissions(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return {
      agenda: Boolean(parsed.agenda),
      clients: Boolean(parsed.clients),
      finance: Boolean(parsed.finance),
      settings: Boolean(parsed.settings),
    };
  } catch {
    return { agenda: true, clients: true, finance: false, settings: false };
  }
}

function safeTimeOff(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validTime(value: unknown, fallback: string) {
  const text = String(value || "");
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

