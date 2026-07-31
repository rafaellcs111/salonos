import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"));
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });

  const today = localDate(new Date());
  const month = today.slice(0, 7);
  const weekStartDate = startOfWeek(new Date());
  const weekStart = localDate(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  const weekEnd = localDate(weekEndDate);

  const [todaySummary, monthClients, weekAppointments, team, professionals, averageService] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status NOT IN ('cancelled','blocked') THEN 1 ELSE 0 END) AS appointments,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      ROUND(SUM(CASE WHEN status = 'completed' THEN COALESCE(
        (SELECT price FROM services s WHERE s.tenant_id = appointments.tenant_id
         AND s.name = appointments.service ORDER BY s.id DESC LIMIT 1), 0) ELSE 0 END), 2) AS revenue
      FROM appointments WHERE tenant_id = ? AND date = ?`)
      .bind(access.tenantId, today).first<Record<string, number>>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT phone) AS total FROM appointments
      WHERE tenant_id = ? AND substr(date, 1, 7) = ? AND status NOT IN ('cancelled','blocked')`)
      .bind(access.tenantId, month).first<{ total: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM appointments
      WHERE tenant_id = ? AND date BETWEEN ? AND ? AND status NOT IN ('cancelled','blocked')`)
      .bind(access.tenantId, weekStart, weekEnd).first<{ total: number }>(),
    env.DB.prepare(`SELECT barber,
      COUNT(*) AS appointments,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      ROUND(SUM(CASE WHEN status = 'completed' THEN COALESCE(
        (SELECT price FROM services s WHERE s.tenant_id = appointments.tenant_id
         AND s.name = appointments.service ORDER BY s.id DESC LIMIT 1), 0) ELSE 0 END), 2) AS revenue
      FROM appointments
      WHERE tenant_id = ? AND substr(date, 1, 7) = ? AND status NOT IN ('cancelled','blocked')
      GROUP BY barber ORDER BY appointments DESC`)
      .bind(access.tenantId, month).all(),
    env.DB.prepare(`SELECT work_days AS workDays, work_start AS workStart, work_end AS workEnd,
      break_start AS breakStart, break_end AS breakEnd FROM barbers
      WHERE tenant_id = ? AND active = 1 AND lower(role) != 'caixa'`).bind(access.tenantId).all(),
    env.DB.prepare("SELECT AVG(duration) AS duration FROM services WHERE tenant_id = ? AND active = 1")
      .bind(access.tenantId).first<{ duration: number }>(),
  ]);

  const capacity = calculateWeeklyCapacity(professionals.results, Number(averageService?.duration || 45));
  const occupancy = capacity ? Math.min(100, Math.round(Number(weekAppointments?.total || 0) / capacity * 100)) : 0;
  const canSeeFinance = access.permissions.finance;
  const canSeeClients = access.permissions.clients;

  return Response.json({
    metrics: {
      todayAppointments: Number(todaySummary?.appointments || 0),
      todayCompleted: Number(todaySummary?.completed || 0),
      todayRevenue: canSeeFinance ? Number(todaySummary?.revenue || 0) : null,
      monthClients: canSeeClients ? Number(monthClients?.total || 0) : null,
      occupancy,
      weeklyCapacity: capacity,
      weeklyAppointments: Number(weekAppointments?.total || 0),
    },
    team: team.results.map((item) => ({
      barber: String(item.barber),
      appointments: Number(item.appointments || 0),
      completed: Number(item.completed || 0),
      revenue: canSeeFinance ? Number(item.revenue || 0) : null,
    })),
  });
}

function calculateWeeklyCapacity(items: Record<string, unknown>[], averageDuration: number) {
  return items.reduce((total, item) => {
    const days = parseDays(item.workDays).length;
    const start = minutes(String(item.workStart || "09:00"));
    const end = minutes(String(item.workEnd || "18:00"));
    const breakDuration = item.breakStart && item.breakEnd
      ? Math.max(0, minutes(String(item.breakEnd)) - minutes(String(item.breakStart)))
      : 0;
    const dailySlots = Math.max(0, Math.floor((end - start - breakDuration) / Math.max(15, averageDuration)));
    return total + dailySlots * days;
  }, 0);
}

function parseDays(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function localDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const weekday = result.getDay();
  result.setDate(result.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return result;
}
