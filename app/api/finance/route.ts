import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getTenantAccess(url.searchParams.get("tenant"), "finance");
  if (!access) return Response.json({ error: "Acesso restrito a esta barbearia" }, { status: 403 });
  if (access.plan === "starter") {
    return Response.json({ error: "Financeiro disponível nos planos Pro e Premium" }, { status: 403 });
  }
  const period = url.searchParams.get("period") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: "Período inválido" }, { status: 400 });
  }

  const [serviceSummary, byBarber, serviceTransactions, productSummary, productTransactions] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS completedAppointments,
        ROUND(SUM(COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0)), 2) AS revenue
       FROM appointments
       WHERE tenant_id = ? AND status = 'completed' AND substr(date, 1, 7) = ?`,
    ).bind(access.tenantId, period).all(),
    env.DB.prepare(
      `SELECT barber, COUNT(*) AS appointments,
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
      `SELECT id, 'service' AS type, customer_name AS customerName, barber, service,
        date, time, 1 AS quantity,
        COALESCE((SELECT price FROM services s
          WHERE s.tenant_id = appointments.tenant_id AND s.name = appointments.service
          ORDER BY s.id DESC LIMIT 1), 0) AS amount
       FROM appointments
       WHERE tenant_id = ? AND status = 'completed' AND substr(date, 1, 7) = ?`,
    ).bind(access.tenantId, period).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS sales, COALESCE(SUM(quantity), 0) AS items,
        COALESCE(SUM(total_amount), 0) AS revenueCents
       FROM inventory_sales WHERE tenant_id = ? AND substr(sale_date, 1, 7) = ?`,
    ).bind(access.tenantId, period).all(),
    env.DB.prepare(
      `SELECT id, 'product' AS type, 'Venda de produto' AS customerName, sold_by AS barber,
        product_name AS service, sale_date AS date,
        strftime('%H:%M', sold_at / 1000, 'unixepoch', '-3 hours') AS time,
        quantity, total_amount / 100.0 AS amount
       FROM inventory_sales
       WHERE tenant_id = ? AND substr(sale_date, 1, 7) = ?`,
    ).bind(access.tenantId, period).all(),
  ]);

  const barbers = (byBarber.results as Array<Record<string, unknown>>).map((item) => {
    const revenue = Number(item.revenue || 0);
    const commissionRate = Number(item.commissionRate || 0);
    return { ...item, commission: Math.round(revenue * commissionRate) / 100 };
  });
  const serviceRevenue = Number(serviceSummary.results[0]?.revenue || 0);
  const productRevenue = Number(productSummary.results[0]?.revenueCents || 0) / 100;
  const commissions = barbers.reduce((sum: number, item) => sum + Number(item.commission || 0), 0);
  const completedAppointments = Number(serviceSummary.results[0]?.completedAppointments || 0);
  const productSales = Number(productSummary.results[0]?.sales || 0);
  const transactions = [...serviceTransactions.results, ...productTransactions.results]
    .sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`))
    .slice(0, 150);
  const transactionCount = completedAppointments + productSales;
  const grossRevenue = serviceRevenue + productRevenue;

  return Response.json({
    summary: {
      completedAppointments,
      productSales,
      productItems: Number(productSummary.results[0]?.items || 0),
      serviceRevenue,
      productRevenue,
      revenue: grossRevenue,
      averageTicket: transactionCount ? grossRevenue / transactionCount : 0,
      commissions,
      netAfterCommissions: grossRevenue - commissions,
    },
    barbers,
    transactions,
    paymentProcessing: false,
  });
}
