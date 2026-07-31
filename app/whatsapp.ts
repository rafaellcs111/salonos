import { env } from "cloudflare:workers";

type AppointmentMessage = {
  tenantId: string;
  phone: string;
  customerName: string;
  barber: string;
  service: string;
  date: string;
  time: string;
};

export async function queueAppointmentConfirmation(message: AppointmentMessage) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    event TEXT NOT NULL,
    recipient TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting_configuration',
    created_at INTEGER NOT NULL,
    sent_at INTEGER
  )`).run();
  await env.DB.prepare(
    `INSERT INTO whatsapp_outbox (tenant_id, event, recipient, payload, status, created_at)
     VALUES (?, 'appointment_confirmation', ?, ?, ?, ?)`,
  ).bind(
    message.tenantId,
    message.phone.replace(/\D/g, ""),
    JSON.stringify(message),
    whatsappConfigured() ? "pending" : "waiting_configuration",
    Date.now(),
  ).run();
}

export function whatsappConfigured() {
  const bindings = env as unknown as {
    WHATSAPP_ACCESS_TOKEN?: string;
    WHATSAPP_PHONE_NUMBER_ID?: string;
  };
  return Boolean(bindings.WHATSAPP_ACCESS_TOKEN && bindings.WHATSAPP_PHONE_NUMBER_ID);
}
