import { env } from "cloudflare:workers";
import { getTenantAccess } from "../../tenant-access";

type OwnerNotification = {
  id: string;
  kind: "agenda" | "stock";
  title: string;
  detail: string;
  target: "Agenda" | "Estoque";
  urgent: boolean;
};

export async function GET(request: Request) {
  const tenant = new URL(request.url).searchParams.get("tenant");
  const access = await getTenantAccess(tenant);
  if (!access || access.role === "staff") {
    return Response.json({ error: "Notificações disponíveis somente para o proprietário" }, { status: 403 });
  }

  const today = saoPauloDate();
  const [todayAppointments, lowStock] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('confirmed', 'waiting') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting
      FROM appointments WHERE tenant_id = ? AND date = ?`)
      .bind(access.tenantId, today).first<{ pending: number; waiting: number }>(),
    access.plan === "starter"
      ? Promise.resolve({ results: [] as Record<string, unknown>[] })
      : env.DB.prepare(`SELECT id, name, quantity, minimum_stock AS minimumStock
          FROM inventory_products
          WHERE tenant_id = ? AND quantity <= minimum_stock
          ORDER BY quantity, name LIMIT 5`)
        .bind(access.tenantId).all(),
  ]);

  const notifications: OwnerNotification[] = [];
  const pending = Number(todayAppointments?.pending || 0);
  const waiting = Number(todayAppointments?.waiting || 0);
  if (pending) {
    notifications.push({
      id: `agenda-${today}`,
      kind: "agenda",
      title: `${pending} atendimento${pending === 1 ? "" : "s"} hoje`,
      detail: waiting ? `${waiting} aguardando atendimento agora.` : "Confira os próximos horários da agenda.",
      target: "Agenda",
      urgent: waiting > 0,
    });
  }
  for (const product of lowStock.results) {
    const quantity = Number(product.quantity || 0);
    notifications.push({
      id: `stock-${product.id}`,
      kind: "stock",
      title: quantity <= 0 ? `${product.name} esgotado` : `${product.name} com estoque baixo`,
      detail: `${quantity} unidade${quantity === 1 ? "" : "s"} ${quantity === 1 ? "disponível" : "disponíveis"} · mínimo ${Number(product.minimumStock || 0)}.`,
      target: "Estoque",
      urgent: quantity <= 0,
    });
  }

  return Response.json({ count: notifications.length, notifications });
}

function saoPauloDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
