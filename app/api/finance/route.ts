import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"), "finance");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  if (access.plan === "starter") {
    return Response.json({ error: "Financeiro disponÃ­vel nos planos Pro e Premium" }, { status: 403 });
  }
  const period = url.searchParams.get("period") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: "PerÃ­odo invÃ¡lido" }, { status: 400 });
  }

  const [summary, byBarber, transactions] = await Promise.all([
    env.DB.prepare(
      `SELECT
        COUNT(*) AS completedAppointments,
        ROUND(SUM(COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0)), 2) AS revenue,
        ROUND(AVG(COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0)), 2) AS averageTicket
       FROM appointments
       WHERE tenant_id = ? AND status = 'completed' AND substr(date, 1, 7) = ?`,
    ).bind(access.tenantId, period).all(),
    env.DB.prepare(
      `SELECT
        barber,
        COUNT(*) AS appointments,
        ROUND(SUM(COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0)), 2) AS revenue,
        COALESCE((SELECT commission FROM barbers b
          WHERE b.tenant_id = appointments.tenant_id AND b.name = appointments.barber
          ORDER BY b.id DESC LIMIT 1), 0) AS commissionRate
       FROM appointments
       WHERE tenant_id = ? AND status = 'completed' AND substr(date, 1, 7) = ?
       GROUP BY barber ORDER BY revenue DESC`,
    ).bind(access.tenantId, period).all(),
    env.DB.prepare(
      `SELECT id, customer_name AS customerName, barber, service, date, time,
        COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0) AS amount
       FROM appointments
       WHERE tenant_id = ? AND status = 'completed' AND substr(date, 1, 7) = ?
       ORDER BY date DESC, time DESC LIMIT 100`,
    ).bind(access.tenantId, period).all(),
  ]);

  const barbers = byBarber.results.map((item) => {
    const revenue = Number(item.revenue || 0);
    const commissionRate = Number(item.commissionRate || 0);
    return { ...item, commission: Math.round(revenue * commissionRate) / 100 };
  });
  const grossRevenue = Number(summary.results[0]?.revenue || 0);
  const commissions = barbers.reduce((sum, item) => sum + Number(item.commission || 0), 0);

  return Response.json({
    summary: {
      completedAppointments: Number(summary.results[0]?.completedAppointments || 0),
      revenue: grossRevenue,
      averageTicket: Number(summary.results[0]?.averageTicket || 0),
      commissions,
      netAfterCommissions: grossRevenue - commissions,
    },
    barbers,
    transactions: transactions.results,
    paymentProcessing: false,
  });
}

