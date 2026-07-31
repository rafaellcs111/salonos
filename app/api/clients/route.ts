import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";
import { isValidCpf, normalizeCpf } from "../../lib/cpf";

async function ensureTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      cpf TEXT NOT NULL DEFAULT '',
      recurring_client_id INTEGER,
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
      is_monthly INTEGER NOT NULL DEFAULT 0,
      recurring_weekday INTEGER,
      recurring_time TEXT NOT NULL DEFAULT '',
      recurring_barber TEXT NOT NULL DEFAULT '',
      recurring_service TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_phone_unique ON clients (tenant_id, phone)"),
  ]);
  const clientColumns = await env.DB.prepare("PRAGMA table_info(clients)").all<{ name: string }>();
  const names = new Set(clientColumns.results.map((column) => column.name));
  const additions = [
    ["cpf", "TEXT NOT NULL DEFAULT ''"], ["birth_date", "TEXT NOT NULL DEFAULT ''"],
    ["notes", "TEXT NOT NULL DEFAULT ''"], ["preferences", "TEXT NOT NULL DEFAULT ''"],
    ["allergies", "TEXT NOT NULL DEFAULT ''"], ["blocked", "INTEGER NOT NULL DEFAULT 0"],
    ["blocked_reason", "TEXT NOT NULL DEFAULT ''"], ["updated_at", "INTEGER"],
  ];
  for (const [column, definition] of additions) {
    if (!names.has(column)) await env.DB.prepare(`ALTER TABLE clients ADD COLUMN ${column} ${definition}`).run();
  }
  const appointmentColumns = await env.DB.prepare("PRAGMA table_info(appointments)").all<{ name: string }>();
  if (!appointmentColumns.results.some((column) => column.name === "no_show")) {
    await env.DB.prepare("ALTER TABLE appointments ADD COLUMN no_show INTEGER NOT NULL DEFAULT 0").run();
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_cpf_unique ON clients (tenant_id, cpf) WHERE cpf != ''").run();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"), "clients");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  await ensureTables();

  const phone = url.searchParams.get("phone")?.trim();
  if (phone) {
    const history = await env.DB.prepare(
      `SELECT id, customer_name AS customerName, phone, barber, service, date, time, status, no_show AS noShow,
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
    `WITH client_phones AS (
      SELECT phone FROM clients WHERE tenant_id = ?
      UNION
      SELECT phone FROM appointments
      WHERE tenant_id = ? AND phone != '-' AND (status != 'cancelled' OR no_show = 1)
    )
    SELECT client_phones.phone,
      COALESCE(
        (SELECT name FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1),
        MAX(appointments.customer_name)
      ) AS name,
      COALESCE((SELECT is_monthly FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), 0) AS isMonthly,
      (SELECT recurring_weekday FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1) AS recurringWeekday,
      COALESCE((SELECT recurring_time FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS recurringTime,
      COALESCE((SELECT recurring_barber FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS recurringBarber,
      COALESCE((SELECT recurring_service FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS recurringService,
      COALESCE((SELECT cpf FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1),
        (SELECT cpf FROM appointments a WHERE a.tenant_id = ? AND a.phone = client_phones.phone AND cpf != '' ORDER BY id DESC LIMIT 1), '') AS cpf,
      COALESCE((SELECT birth_date FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS birthDate,
      COALESCE((SELECT notes FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS notes,
      COALESCE((SELECT preferences FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS preferences,
      COALESCE((SELECT allergies FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS allergies,
      COALESCE((SELECT blocked FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), 0) AS blocked,
      COALESCE((SELECT blocked_reason FROM clients c WHERE c.tenant_id = ? AND c.phone = client_phones.phone LIMIT 1), '') AS blockedReason,
      COUNT(appointments.id) AS appointments,
      SUM(CASE WHEN appointments.status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN appointments.no_show = 1 THEN 1 ELSE 0 END) AS noShows,
      MAX(appointments.date) AS lastVisit,
      COALESCE(MIN(appointments.date), date('now')) AS firstVisit,
      CASE WHEN MAX(appointments.date) IS NOT NULL AND MAX(appointments.date) < date('now', '-60 days') THEN 1 ELSE 0 END AS inactive,
      ROUND(SUM(CASE WHEN appointments.status = 'completed' THEN COALESCE(
        (SELECT price FROM services s
         WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
         ORDER BY s.id DESC LIMIT 1), 0) ELSE 0 END), 2) AS totalSpent
     FROM client_phones
     LEFT JOIN appointments ON appointments.tenant_id = ? AND appointments.phone = client_phones.phone
       AND (appointments.status != 'cancelled' OR appointments.no_show = 1)
     GROUP BY client_phones.phone
     ORDER BY isMonthly DESC, lastVisit DESC, name`,
  ).bind(
    access.tenantId, access.tenantId,
    access.tenantId, access.tenantId, access.tenantId, access.tenantId,
    access.tenantId, access.tenantId, access.tenantId,
    access.tenantId, access.tenantId, access.tenantId, access.tenantId,
    access.tenantId, access.tenantId, access.tenantId, access.tenantId,
  ).all();
  return Response.json({ clients: clients.results });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    tenant?: string;
    name?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    notes?: string;
    preferences?: string;
    allergies?: string;
    isMonthly?: boolean;
    recurringWeekday?: number;
    recurringTime?: string;
    recurringBarber?: string;
    recurringService?: string;
  };
  const access = await getTenantAccess(body.tenant, "clients");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  await ensureTables();
  const name = String(body.name || "").trim().slice(0, 100);
  const phone = String(body.phone || "").trim().slice(0, 30);
  const cpf = body.cpf ? normalizeCpf(body.cpf) : "";
  const birthDate = String(body.birthDate || "").slice(0, 10);
  if (name.length < 2 || phone.replace(/\D/g, "").length < 8) {
    return Response.json({ error: "Informe o nome e um telefone válido" }, { status: 400 });
  }

  const isMonthly = Boolean(body.isMonthly);
  const weekday = Number(body.recurringWeekday);
  const time = String(body.recurringTime || "");
  const barber = String(body.recurringBarber || "").trim().slice(0, 100);
  const service = String(body.recurringService || "").trim().slice(0, 100);
  if (isMonthly && !await getTenantAccess(body.tenant, "agenda")) {
    return Response.json({ error: "Acesso à agenda é necessário para criar horários recorrentes" }, { status: 403 });
  }
  if (isMonthly && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !/^\d{2}:\d{2}$/.test(time) || !barber || !service)) {
    return Response.json({ error: "Defina dia, horário, profissional e serviço do mensalista" }, { status: 400 });
  }
  if (cpf && !isValidCpf(cpf)) return Response.json({ error: "Informe um CPF válido" }, { status: 400 });
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Response.json({ error: "Data de nascimento inválida" }, { status: 400 });
  if (isMonthly && !time.endsWith(":00")) {
    return Response.json({ error: "Escolha um horário cheio, como 09:00, 10:00 ou 11:00" }, { status: 400 });
  }

  if (isMonthly) {
    const [professional, selectedService, businessHours] = await Promise.all([
      env.DB.prepare(`SELECT work_days AS workDays, services, work_start AS workStart,
        work_end AS workEnd, break_start AS breakStart, break_end AS breakEnd
        FROM barbers WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1`)
        .bind(access.tenantId, barber).first<{ workDays: string; services: string; workStart: string; workEnd: string; breakStart: string; breakEnd: string }>(),
      env.DB.prepare("SELECT id, duration FROM services WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1")
        .bind(access.tenantId, service).first<{ id: number; duration: number }>(),
      env.DB.prepare("SELECT open, close FROM business_hours WHERE tenant_id = ? AND active = 1 AND instr(',' || days || ',', ',' || ? || ',') > 0 LIMIT 1")
        .bind(access.tenantId, String(weekday)).first<{ open: string; close: string }>(),
    ]);
    if (!professional || !selectedService || !businessHours) {
      return Response.json({ error: "Profissional, serviço ou dia indisponível" }, { status: 400 });
    }
    if (!parseArray(professional.workDays).includes(String(weekday))) {
      return Response.json({ error: "O profissional não trabalha no dia semanal escolhido" }, { status: 400 });
    }
    const services = parseArray(professional.services);
    if (services.length && !services.includes(service)) {
      return Response.json({ error: "O profissional não realiza o serviço escolhido" }, { status: 400 });
    }
    const start = toMinutes(time);
    const end = start + Number(selectedService.duration || 30);
    const workStart = Math.max(toMinutes(businessHours.open), toMinutes(professional.workStart || businessHours.open));
    const workEnd = Math.min(toMinutes(businessHours.close), toMinutes(professional.workEnd || businessHours.close));
    if (start < workStart || end > workEnd) {
      return Response.json({ error: "O horário fixo está fora do expediente do profissional" }, { status: 400 });
    }
    if (professional.breakStart && professional.breakEnd
      && start < toMinutes(professional.breakEnd) && end > toMinutes(professional.breakStart)) {
      return Response.json({ error: "O horário fixo coincide com a pausa do profissional" }, { status: 400 });
    }
  }

  try {
    await env.DB.prepare(
    `INSERT INTO clients
      (tenant_id, name, phone, cpf, birth_date, notes, preferences, allergies,
       is_monthly, recurring_weekday, recurring_time, recurring_barber, recurring_service, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, phone) DO UPDATE SET
       name = excluded.name,
       cpf = excluded.cpf,
       birth_date = excluded.birth_date,
       notes = excluded.notes,
       preferences = excluded.preferences,
       allergies = excluded.allergies,
       is_monthly = excluded.is_monthly,
       recurring_weekday = excluded.recurring_weekday,
       recurring_time = excluded.recurring_time,
       recurring_barber = excluded.recurring_barber,
       recurring_service = excluded.recurring_service,
       updated_at = excluded.updated_at`,
  ).bind(
    access.tenantId, name, phone, cpf, birthDate,
    String(body.notes || "").trim().slice(0, 1000), String(body.preferences || "").trim().slice(0, 500),
    String(body.allergies || "").trim().slice(0, 500), isMonthly ? 1 : 0, isMonthly ? weekday : null,
    isMonthly ? time : "", isMonthly ? barber : "", isMonthly ? service : "", Date.now(), Date.now(),
    ).run();
  } catch {
    return Response.json({ error: "Este CPF já está vinculado a outro cliente" }, { status: 409 });
  }

  if (!isMonthly) return Response.json({ ok: true, recurringCreated: 0 }, { status: 201 });

  const client = await env.DB.prepare(
    "SELECT id FROM clients WHERE tenant_id = ? AND phone = ? LIMIT 1",
  ).bind(access.tenantId, phone).first<{ id: number }>();
  if (!client) return Response.json({ error: "Cliente não encontrado após o cadastro" }, { status: 500 });

  const dates = weeklyDates(weekday, 26);
  await env.DB.prepare(
    `DELETE FROM appointments
     WHERE tenant_id = ? AND recurring_client_id = ? AND date >= ?
       AND status IN ('confirmed', 'waiting')`,
  ).bind(access.tenantId, client.id, saoPauloDate()).run();
  const serviceDuration = await env.DB.prepare(
    "SELECT duration FROM services WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1",
  ).bind(access.tenantId, service).first<{ duration: number }>();
  const occupied = await env.DB.prepare(
    `SELECT a.date, a.time,
      COALESCE((SELECT duration FROM services s WHERE s.tenant_id = a.tenant_id AND s.name = a.service ORDER BY s.id DESC LIMIT 1), 30) AS duration
     FROM appointments a
     WHERE a.tenant_id = ? AND a.barber = ? AND a.status != 'cancelled'
       AND a.date BETWEEN ? AND ?`,
  ).bind(access.tenantId, barber, dates[0], dates[dates.length - 1]).all();
  const requestedStart = toMinutes(time);
  const requestedEnd = requestedStart + Number(serviceDuration?.duration || 30);
  const occupiedSlots = occupied.results as Array<{ date: unknown; time: unknown; duration: unknown }>;
  const availableDates = dates.filter((date) => !occupiedSlots.some((entry) => {
    if (String(entry.date) !== date) return false;
    const occupiedStart = toMinutes(String(entry.time));
    return requestedStart < occupiedStart + Number(entry.duration || 30) && requestedEnd > occupiedStart;
  }));
  const results = availableDates.length ? await env.DB.batch(availableDates.map((date) =>
    env.DB.prepare(`INSERT OR IGNORE INTO appointments
      (tenant_id, customer_name, phone, cpf, recurring_client_id, barber, service, date, time, status, created_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, 'confirmed', ?)`)
      .bind(access.tenantId, name, phone, client.id, barber, service, date, time, Date.now()),
  )) : [];
  const recurringCreated = results.reduce(
    (sum: number, result: { meta: { changes?: number } }) => sum + Number(result.meta.changes || 0),
    0,
  );
  return Response.json({
    ok: true,
    recurringCreated,
    recurringSkipped: dates.length - recurringCreated,
    weeksPrepared: dates.length,
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json() as {
    tenant?: string; phone?: string; action?: string; name?: string; cpf?: string;
    birthDate?: string; notes?: string; preferences?: string; allergies?: string;
    blocked?: boolean; blockedReason?: string;
  };
  const access = await getTenantAccess(body.tenant, "clients");
  if (!access) return Response.json({ error: "Acesso a clientes é necessário" }, { status: 403 });
  await ensureTables();
  if (!body.phone) return Response.json({ error: "Cliente não informado" }, { status: 400 });

  if (body.action === "update-profile") {
    const cpf = body.cpf ? normalizeCpf(body.cpf) : "";
    if (cpf && !isValidCpf(cpf)) return Response.json({ error: "Informe um CPF válido" }, { status: 400 });
    const birthDate = String(body.birthDate || "").slice(0, 10);
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return Response.json({ error: "Data de nascimento inválida" }, { status: 400 });
    try {
      await env.DB.prepare(`INSERT INTO clients
        (tenant_id, name, phone, cpf, birth_date, notes, preferences, allergies, blocked, blocked_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, phone) DO UPDATE SET name = excluded.name, cpf = excluded.cpf,
          birth_date = excluded.birth_date, notes = excluded.notes, preferences = excluded.preferences,
          allergies = excluded.allergies, blocked = excluded.blocked,
          blocked_reason = excluded.blocked_reason, updated_at = excluded.updated_at`).bind(
        access.tenantId, String(body.name || "").trim().slice(0, 100), body.phone, cpf, birthDate,
        String(body.notes || "").trim().slice(0, 1000), String(body.preferences || "").trim().slice(0, 500),
        String(body.allergies || "").trim().slice(0, 500), body.blocked ? 1 : 0,
        body.blocked ? String(body.blockedReason || "").trim().slice(0, 300) : "",
        Date.now(), Date.now(),
      ).run();
      return Response.json({ ok: true });
    } catch {
      return Response.json({ error: "Este CPF já está vinculado a outro cliente" }, { status: 409 });
    }
  }

  const agendaAccess = await getTenantAccess(body.tenant, "agenda");
  if (!agendaAccess) return Response.json({ error: "Acesso à agenda é necessário" }, { status: 403 });
  if (body.action !== "stop-monthly") {
    return Response.json({ error: "Atualização inválida" }, { status: 400 });
  }
  const client = await env.DB.prepare(
    "SELECT id FROM clients WHERE tenant_id = ? AND phone = ? AND is_monthly = 1 LIMIT 1",
  ).bind(access.tenantId, body.phone).first<{ id: number }>();
  if (!client) return Response.json({ error: "Mensalista não encontrado" }, { status: 404 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE clients SET is_monthly = 0, recurring_weekday = NULL,
      recurring_time = '', recurring_barber = '', recurring_service = ''
      WHERE id = ? AND tenant_id = ?`).bind(client.id, access.tenantId),
    env.DB.prepare(`DELETE FROM appointments
      WHERE tenant_id = ? AND recurring_client_id = ? AND date >= ?
        AND status IN ('confirmed', 'waiting')`).bind(access.tenantId, client.id, saoPauloDate()),
  ]);
  return Response.json({ ok: true });
}

function weeklyDates(weekday: number, count: number) {
  const today = saoPauloDate();
  const first = new Date(`${today}T12:00:00`);
  first.setDate(first.getDate() + ((weekday - first.getDay() + 7) % 7 || 7));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index * 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
