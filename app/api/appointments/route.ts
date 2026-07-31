import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";
import { isValidCpf, normalizeCpf } from "../../lib/cpf";
import {
  consumeRateLimit,
  rateLimitResponse,
  requestClientAddress,
} from "../../security";

const TENANT = "chosen";
const ALLOWED_STATUSES = new Set(["confirmed", "waiting", "completed", "cancelled", "blocked"]);

async function ensureAppointmentsTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS appointments (
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
    created_at INTEGER NOT NULL,
    UNIQUE(tenant_id, barber, date, time)
  )`).run();
}

export async function GET(request: Request) {
  await ensureAppointmentsTable();
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const barber = url.searchParams.get("barber");
  const requestedTenant = url.searchParams.get("tenant") || TENANT;

  if (url.searchParams.get("availability") === "1") {
    if (!date || !barber) {
      return Response.json({ error: "Data e profissional são obrigatórios" }, { status: 400 });
    }
    const activeTenant = await env.DB.prepare("SELECT id FROM tenants WHERE id = ? AND active = 1 LIMIT 1")
      .bind(requestedTenant).all();
    if (!activeTenant.results.length) {
      return Response.json({ error: "Barbearia indisponível" }, { status: 404 });
    }
    const booked = await env.DB.prepare(
      `SELECT a.time,
        COALESCE((SELECT duration FROM services s WHERE s.tenant_id = a.tenant_id AND s.name = a.service ORDER BY s.id DESC LIMIT 1), 30) AS duration
       FROM appointments a
       WHERE a.tenant_id = ? AND a.barber = ? AND a.date = ? AND a.status != 'cancelled'
       ORDER BY time`,
    ).bind(requestedTenant, barber, date).all();
    return Response.json({
      booked: booked.results.map((item) => item.time),
      occupied: booked.results.map((item) => ({ time: item.time, duration: Number(item.duration || 30) })),
    });
  }

  const access = await getTenantAccess(requestedTenant, "agenda");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });

  const result = date
    ? await env.DB.prepare(
        `SELECT id, customer_name AS customerName, phone, barber, service, date, time, status
         FROM appointments WHERE tenant_id = ? AND date = ? ORDER BY time`,
      ).bind(access.tenantId, date).all()
    : await env.DB.prepare(
        `SELECT id, customer_name AS customerName, phone, barber, service, date, time, status
         FROM appointments WHERE tenant_id = ? ORDER BY date DESC, time LIMIT 100`,
      ).bind(access.tenantId).all();
  return Response.json({ appointments: result.results });
}

export async function POST(request: Request) {
  const body = await request.json() as Record<string, string>;
  const required = ["customerName", "phone", "cpf", "barber", "service", "date", "time"];
  if (required.some((field) => !body[field])) {
    return Response.json({ error: "Dados incompletos" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !/^\d{2}:\d{2}$/.test(body.time)) {
    return Response.json({ error: "Data ou horário inválido" }, { status: 400 });
  }
  if (!body.customerName.trim() || body.phone.replace(/\D/g, "").length < 8) {
    return Response.json({ error: "Informe um nome e WhatsApp válidos" }, { status: 400 });
  }
  if (!isValidCpf(body.cpf)) {
    return Response.json({ error: "Informe um CPF válido" }, { status: 400 });
  }
  const cpf = normalizeCpf(body.cpf);
  const { date: today, minutes: currentMinutes } = getCurrentSaoPauloTime();
  if (body.date < today) {
    return Response.json({ error: "Não é possível agendar uma data passada" }, { status: 400 });
  }
  if (body.date === today && toMinutes(body.time) <= currentMinutes) {
    return Response.json({ error: "Este horário já passou" }, { status: 400 });
  }
  await ensureAppointmentsTable();
  const requestedTenant = body.tenant || TENANT;
  const requestedStatus = body.status || "confirmed";
  if (requestedStatus !== "confirmed") {
    const access = await getTenantAccess(requestedTenant, "agenda");
    if (!access || !ALLOWED_STATUSES.has(requestedStatus)) {
      return Response.json({ error: "Status não autorizado" }, { status: 403 });
    }
  }
  const activeTenant = await env.DB.prepare("SELECT id FROM tenants WHERE id = ? AND active = 1 LIMIT 1")
    .bind(requestedTenant).all();
  if (!activeTenant.results.length) {
    return Response.json({ error: "Barbearia indisponível" }, { status: 404 });
  }
  if (requestedStatus === "confirmed") {
    const rateLimit = await consumeRateLimit({
      namespace: "public-booking",
      identifier: `${requestClientAddress(request)}:${requestedTenant}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit, "Muitos agendamentos foram solicitados. Aguarde e tente novamente.");
    }
    const availabilityError = await validateProfessionalSlot(requestedTenant, body);
    if (availabilityError) return Response.json({ error: availabilityError }, { status: 409 });
  }

  try {
    await env.DB.prepare(`INSERT INTO appointments
      (tenant_id, customer_name, phone, cpf, barber, service, date, time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        requestedTenant,
        body.customerName.trim().slice(0, 100),
        body.phone.trim().slice(0, 30),
        cpf,
        body.barber.trim().slice(0, 100),
        body.service.trim().slice(0, 100),
        body.date,
        body.time,
        requestedStatus,
        Date.now(),
      )
      .run();
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    const cancelled = await env.DB.prepare(
      `SELECT id FROM appointments
       WHERE tenant_id = ? AND barber = ? AND date = ? AND time = ? AND status = 'cancelled'
       LIMIT 1`,
    ).bind(requestedTenant, body.barber, body.date, body.time).all();
    const cancelledId = cancelled.results[0]?.id;
    if (!cancelledId) {
      return Response.json({ error: "Horário indisponível" }, { status: 409 });
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM appointments WHERE id = ? AND tenant_id = ?").bind(cancelledId, requestedTenant),
      env.DB.prepare(`INSERT INTO appointments
        (tenant_id, customer_name, phone, cpf, barber, service, date, time, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          requestedTenant,
          body.customerName.trim().slice(0, 100),
          body.phone.trim().slice(0, 30),
          cpf,
          body.barber.trim().slice(0, 100),
          body.service.trim().slice(0, 100),
          body.date,
          body.time,
          requestedStatus,
          Date.now(),
        ),
    ]);
    return Response.json({ ok: true }, { status: 201 });
  }
}

async function validateProfessionalSlot(
  tenantId: string,
  body: Record<string, string>,
  excludeAppointmentId = 0,
) {
  const [professional, service, businessHours, occupied] = await Promise.all([
    env.DB.prepare(`SELECT services, work_days AS workDays, work_start AS workStart,
      work_end AS workEnd, break_start AS breakStart, break_end AS breakEnd, time_off AS timeOff
      FROM barbers WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1`)
      .bind(tenantId, body.barber).first<Record<string, string>>(),
    env.DB.prepare("SELECT duration FROM services WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1")
      .bind(tenantId, body.service).first<{ duration: number }>(),
    env.DB.prepare("SELECT days, open, close FROM business_hours WHERE tenant_id = ? AND active = 1")
      .bind(tenantId).all(),
    env.DB.prepare(`SELECT a.time,
      COALESCE((SELECT duration FROM services s WHERE s.tenant_id = a.tenant_id AND s.name = a.service ORDER BY s.id DESC LIMIT 1), 30) AS duration
      FROM appointments a
      WHERE a.tenant_id = ? AND a.barber = ? AND a.date = ?
        AND a.status != 'cancelled' AND a.id != ?`)
      .bind(tenantId, body.barber, body.date, excludeAppointmentId).all(),
  ]);
  if (!professional || !service) return "Profissional ou serviço indisponível";

  const services = parseJsonArray(professional.services);
  if (services.length && !services.includes(body.service)) return "Este profissional não atende o serviço escolhido";
  const date = new Date(`${body.date}T12:00:00`);
  const weekday = String(date.getDay());
  if (!parseJsonArray(professional.workDays).includes(weekday)) return "O profissional não trabalha nesta data";
  const away = parseTimeOff(professional.timeOff).some((period) => period.start <= body.date && period.end >= body.date);
  if (away) return "O profissional está de folga ou férias nesta data";

  const business = businessHours.results.find((item) => String(item.days).split(",").includes(weekday));
  if (!business) return "A barbearia não abre nesta data";
  const start = toMinutes(body.time);
  const end = start + Number(service.duration || 30);
  const workStart = Math.max(toMinutes(String(business.open)), toMinutes(professional.workStart || String(business.open)));
  const workEnd = Math.min(toMinutes(String(business.close)), toMinutes(professional.workEnd || String(business.close)));
  if (start < workStart || end > workEnd) return "Horário fora do expediente do profissional";
  if (professional.breakStart && professional.breakEnd) {
    const breakStart = toMinutes(professional.breakStart);
    const breakEnd = toMinutes(professional.breakEnd);
    if (start < breakEnd && end > breakStart) return "Horário dentro da pausa do profissional";
  }
  const conflict = occupied.results.some((item) => {
    const occupiedStart = toMinutes(String(item.time));
    const occupiedEnd = occupiedStart + Number(item.duration || 30);
    return start < occupiedEnd && end > occupiedStart;
  });
  return conflict ? "Este horário conflita com outro agendamento" : null;
}

function parseJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseTimeOff(value: unknown): { start: string; end: string }[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getCurrentSaoPauloTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

export async function PATCH(request: Request) {
  const body = await request.json() as {
    id?: number;
    tenant?: string;
    status?: string;
    date?: string;
    time?: string;
    barber?: string;
  };
  const access = await getTenantAccess(body.tenant, "agenda");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  if (!body.id || (body.status && !ALLOWED_STATUSES.has(body.status))) {
    return Response.json({ error: "Atualização inválida" }, { status: 400 });
  }
  if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return Response.json({ error: "Data inválida" }, { status: 400 });
  }
  if (body.time && !/^\d{2}:\d{2}$/.test(body.time)) {
    return Response.json({ error: "Horário inválido" }, { status: 400 });
  }
  await ensureAppointmentsTable();
  const currentResult = await env.DB.prepare(
    `SELECT id, barber, service, date, time, status FROM appointments
     WHERE id = ? AND tenant_id = ? LIMIT 1`,
  ).bind(body.id, access.tenantId).all();
  const current = currentResult.results[0] as Record<string, string | number> | undefined;
  if (!current) return Response.json({ error: "Agendamento não encontrado" }, { status: 404 });

  const nextBarber = (body.barber || String(current.barber)).trim().slice(0, 100);
  const nextDate = body.date || String(current.date);
  const nextTime = body.time || String(current.time);
  const nextStatus = body.status || String(current.status);
  const scheduleChanged = Boolean(body.date || body.time || body.barber);

  if (nextStatus !== "cancelled" && scheduleChanged) {
    const { date: today, minutes: currentMinutes } = getCurrentSaoPauloTime();
    if (nextDate < today) {
      return Response.json({ error: "Não é possível reagendar para uma data passada" }, { status: 400 });
    }
    if (nextDate === today && toMinutes(nextTime) <= currentMinutes) {
      return Response.json({ error: "Este horário já passou" }, { status: 400 });
    }
    const availabilityError = await validateProfessionalSlot(
      access.tenantId,
      {
        barber: nextBarber,
        service: String(current.service),
        date: nextDate,
        time: nextTime,
      },
      body.id,
    );
    if (availabilityError) {
      return Response.json({ error: availabilityError }, { status: 409 });
    }
    const conflict = await env.DB.prepare(
      `SELECT id, status FROM appointments
       WHERE tenant_id = ? AND barber = ? AND date = ? AND time = ? AND id != ?
       LIMIT 1`,
    ).bind(access.tenantId, nextBarber, nextDate, nextTime, body.id).all();
    const occupied = conflict.results[0] as Record<string, string | number> | undefined;
    if (occupied && occupied.status !== "cancelled") {
      return Response.json({ error: "Este horário já está ocupado" }, { status: 409 });
    }
    if (occupied?.status === "cancelled") {
      await env.DB.prepare("DELETE FROM appointments WHERE id = ? AND tenant_id = ?")
        .bind(occupied.id, access.tenantId).run();
    }
  }

  try {
    await env.DB.prepare(
      `UPDATE appointments SET barber = ?, date = ?, time = ?, status = ?
       WHERE id = ? AND tenant_id = ?`,
    ).bind(nextBarber, nextDate, nextTime, nextStatus, body.id, access.tenantId).run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Este horário já está ocupado" }, { status: 409 });
  }
}

