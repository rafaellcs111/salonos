import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  ownerEmail: text("owner_email"),
  logoKey: text("logo_key"),
  businessType: text("business_type").notNull().default("barbershop"),
  theme: text("theme").notNull().default("black"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  plan: text("plan").notNull().default("pro"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  cpf: text("cpf").notNull().default(""),
  barber: text("barber").notNull(),
  service: text("service").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  status: text("status").notNull().default("confirmed"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  uniqueIndex("appointments_slot_unique").on(table.tenantId, table.barber, table.date, table.time),
]);

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  duration: integer("duration").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("clients_tenant_phone_unique").on(table.tenantId, table.phone),
]);

export const barbers = sqliteTable("barbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  photoKey: text("photo_key"),
  accessEnabled: integer("access_enabled", { mode: "boolean" }).notNull().default(false),
  accessMustChange: integer("access_must_change", { mode: "boolean" }).notNull().default(false),
  temporaryPasswordHash: text("temporary_password_hash"),
  role: text("role").notNull().default("Barbeiro"),
  commission: integer("commission").notNull().default(30),
  services: text("services").notNull().default("[]"),
  workDays: text("work_days").notNull().default('["2","3","4","5","6"]'),
  workStart: text("work_start").notNull().default("09:00"),
  workEnd: text("work_end").notNull().default("18:00"),
  breakStart: text("break_start").notNull().default(""),
  breakEnd: text("break_end").notNull().default(""),
  timeOff: text("time_off").notNull().default("[]"),
  permissions: text("permissions").notNull().default('{"agenda":true,"clients":true,"finance":false,"settings":false}'),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const businessHours = sqliteTable("business_hours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  label: text("label").notNull(),
  days: text("days").notNull(),
  open: text("open").notNull(),
  close: text("close").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id"),
  tenantName: text("tenant_name").notNull(),
  action: text("action").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  actorEmail: text("actor_email").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
});

export const salonosSessions = sqliteTable("salonos_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const platformAdmins = sqliteTable("platform_admins", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  keyHash: text("key_hash").notNull(),
  namespace: text("namespace").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  uniqueIndex("rate_limits_key_window_unique").on(table.keyHash, table.windowStartedAt),
]);

export const inventoryProducts = sqliteTable("inventory_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Geral"),
  quantity: integer("quantity").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  cost: integer("cost").notNull().default(0),
  salePrice: integer("sale_price").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

