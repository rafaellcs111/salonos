import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("ships the SalonOS product instead of the starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    source("app/page.tsx"),
    source("app/layout.tsx"),
    source("package.json"),
  ]);

  assert.match(page, /SalonOS/);
  assert.match(page, /BookingFlow/);
  assert.match(page, /MasterContent/);
  assert.match(layout, /SalonOS/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("keeps Portuguese copy encoded as UTF-8", async () => {
  const files = await Promise.all([
    source("app/page.tsx"),
    source("app/agendar/[slug]/public-booking.tsx"),
    source("app/supabase-auth.ts"),
    source("app/api/appointments/route.ts"),
    source("app/api/config/route.ts"),
    source("app/api/barber-photo/route.ts"),
    source("app/api/auth/manage-user/route.ts"),
    source("app/api/auth/change-password/route.ts"),
    source("app/api/finance/route.ts"),
    source("app/api/tenants/route.ts"),
  ]);
  const combined = files.join("\n");
  const mojibake = /\u00c3[\u0080-\u00ff\u0192]|\u00c2[\u0080-\u00ff]|\u00e2[\u0080-\u00ff\u2020\u2021\u20ac\u2122]|\ufffd/;

  assert.doesNotMatch(combined, mojibake);
  assert.match(combined, /Gestão inteligente para negócios de beleza/);
  assert.match(combined, /Não foi possível/);
});

test("keeps public booking and owner actions backed by durable data", async () => {
  const [schema, appointments, tenants, publicBooking, hosting] =
    await Promise.all([
      source("db/schema.ts"),
      source("app/api/appointments/route.ts"),
      source("app/api/tenants/route.ts"),
      source("app/agendar/[slug]/public-booking.tsx"),
      source(".openai/hosting.json"),
    ]);

  assert.match(schema, /appointments_slot_unique/);
  assert.match(appointments, /rio indispon/);
  assert.match(appointments, /status != 'cancelled'/);
  assert.match(tenants, /getBarberOSOwner/);
  assert.match(tenants, /UPDATE tenants SET name/);
  assert.match(tenants, /owner_email/);
  assert.match(publicBooking, /api\/storefront/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("enforces plan boundaries and removes all tenant-owned data", async () => {
  const [page, finance, inventory, config, tenants, appointments] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/finance/route.ts"),
    source("app/api/inventory/route.ts"),
    source("app/api/config/route.ts"),
    source("app/api/tenants/route.ts"),
    source("app/api/appointments/route.ts"),
  ]);

  assert.match(page, /tenantPlan !== "starter"/);
  assert.match(finance, /access\.plan === "starter"/);
  assert.match(inventory, /access\.plan !== "starter"/);
  assert.match(config, /professionalLimit/);
  assert.match(config, /access\.plan === "starter" \? 1 : access\.plan === "pro" \? 5/);
  assert.match(page, /disabled=\{reachedProfessionalLimit\}/);
  assert.match(page, /profissionais ilimitados/);
  assert.match(config, /getTenantAccess\(requestedTenant\)/);
  assert.match(config, /bind\(access\.tenantId\)/);
  assert.doesNotMatch(config, /name: "Thiago"/);
  assert.match(tenants, /DELETE FROM inventory_products/);
  assert.match(tenants, /deleteSupabaseUser/);
  assert.match(tenants, /Reduza a equipe para \$\{professionalLimit\}/);
  assert.match(appointments, /agendar uma data passada/);
});

test("hydrates the tenant plan immediately after password login", async () => {
  const page = await source("app/page.tsx");

  assert.match(page, /setTenantPlan\(user\.plan\)/);
  assert.match(page, /api\/config\?tenant=\$\{encodeURIComponent\(managedTenant\)\}/);
  assert.match(page, /await onSuccess\(profile\)/);
  assert.match(page, /Plano \$\{tenantPlanLabel\}/);
});

test("guides new tenants through launch and generates their booking QR code locally", async () => {
  const [page, packageJson] = await Promise.all([
    source("app/page.tsx"),
    source("package.json"),
  ]);

  assert.match(page, /function OnboardingPanel/);
  assert.match(page, /QRCode\.toDataURL/);
  assert.match(page, /Baixar QR/);
  assert.match(page, /Prepare \$\{tenantName\} para receber clientes/);
  assert.match(page, /if \(item === "Equipe"\) return permissions\.settings/);
  assert.match(packageJson, /"qrcode"/);
});

test("connects every dashboard quick action to a durable workflow", async () => {
  const [page, clients, appointments, schema] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/clients/route.ts"),
    source("app/api/appointments/route.ts"),
    source("db/schema.ts"),
  ]);

  assert.match(page, /onQuickAction\?\.\("appointment"\)/);
  assert.match(page, /onQuickAction\?\.\("client"\)/);
  assert.match(page, /onQuickAction\?\.\("blocked"\)/);
  assert.match(page, /completeQuickAppointment/);
  assert.match(clients, /export async function POST/);
  assert.match(clients, /ON CONFLICT\(tenant_id, phone\)/);
  assert.match(appointments, /const scheduleChanged/);
  assert.match(schema, /export const clients/);
});

test("shows tenant branding and stores professional photos per establishment", async () => {
  const [page, config, photos, storefront, booking, schema, migration, hosting] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/config/route.ts"),
    source("app/api/barber-photo/route.ts"),
    source("app/api/storefront/[slug]/route.ts"),
    source("app/agendar/[slug]/public-booking.tsx"),
    source("db/schema.ts"),
    source("drizzle/0015_barber_photos.sql"),
    source(".openai/hosting.json"),
  ]);

  assert.match(page, /function TenantWorkspaceMark/);
  assert.match(page, /uploadBarberPhoto/);
  assert.match(page, /Adicionar foto/);
  assert.match(config, /photo_key AS photoKey/);
  assert.match(config, /safePhotoKey/);
  assert.match(photos, /barbers\/\$\{access\.tenantId\}\//);
  assert.match(photos, /MAX_PHOTO_SIZE/);
  assert.match(storefront, /photoUrl/);
  assert.match(booking, /public-barber-photo/);
  assert.match(schema, /photoKey: text\("photo_key"\)/);
  assert.match(migration, /ALTER TABLE barbers ADD COLUMN photo_key/);
  assert.equal(JSON.parse(hosting).r2, "MEDIA");
});

test("provisions staff access with a unique one-time temporary password", async () => {
  const [page, manageUser, changePassword, tenantAccess, me, config, migration, security] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/auth/manage-user/route.ts"),
    source("app/api/auth/change-password/route.ts"),
    source("app/tenant-access.ts"),
    source("app/api/me/route.ts"),
    source("app/api/config/route.ts"),
    source("drizzle/0018_security_foundation.sql"),
    source("app/security.ts"),
  ]);

  assert.match(manageUser, /generateTemporaryPassword\(\)/);
  assert.match(manageUser, /temporaryPasswordHash\(temporaryPassword\)/);
  assert.doesNotMatch(manageUser, /12345678/);
  assert.match(manageUser, /getTenantAccess\(body\.tenant, "settings"\)/);
  assert.match(manageUser, /access_enabled = 1, access_must_change = 1/);
  assert.match(manageUser, /getBarberOSOwner/);
  assert.match(changePassword, /temporaryPasswordHash\(password\)/);
  assert.match(changePassword, /temporary_password_hash = NULL/);
  assert.match(changePassword, /access_must_change = 0/);
  assert.match(tenantAccess, /b\.access_enabled = 1/);
  assert.match(me, /mustChangePassword/);
  assert.match(config, /access_enabled AS accessEnabled/);
  assert.match(config, /temporaryPasswordHashes/);
  assert.match(config, /revokedEmails/);
  assert.match(migration, /temporary_password_hash/);
  assert.match(security, /crypto\.getRandomValues/);
  assert.match(page, /function PasswordChangeGate/);
  assert.match(page, /Senha provisória única/);
  assert.doesNotMatch(page, /12345678/);
});

test("rate limits password login and anonymous bookings with privacy-safe keys", async () => {
  const [security, login, appointments, migration] = await Promise.all([
    source("app/security.ts"),
    source("app/api/auth/login/route.ts"),
    source("app/api/appointments/route.ts"),
    source("drizzle/0018_security_foundation.sql"),
  ]);

  assert.match(security, /sha256\(`\$\{namespace\}:\$\{identifier/);
  assert.match(security, /ON CONFLICT\(key_hash, window_started_at\)/);
  assert.match(security, /"Retry-After"/);
  assert.match(login, /namespace: "auth-login"/);
  assert.match(login, /limit: 5/);
  assert.match(appointments, /namespace: "public-booking"/);
  assert.match(appointments, /limit: 20/);
  assert.match(migration, /PRIMARY KEY \(key_hash, window_started_at\)/);
});

test("keeps tenant-owned operations scoped by the authenticated tenant", async () => {
  const routes = await Promise.all([
    source("app/api/appointments/route.ts"),
    source("app/api/clients/route.ts"),
    source("app/api/config/route.ts"),
    source("app/api/dashboard/route.ts"),
    source("app/api/finance/route.ts"),
    source("app/api/inventory/route.ts"),
  ]);

  for (const route of routes) {
    assert.match(route, /getTenantAccess\(/);
    assert.match(route, /access\.tenantId/);
    assert.match(route, /tenant_id = \?/);
  }
});

test("keeps Rafael Doneda as the permanent owner and supports two additional master users", async () => {
  const [page, platformAdmins, platformAdminApi, me, schema, migration] = await Promise.all([
    source("app/page.tsx"),
    source("app/platform-admins.ts"),
    source("app/api/platform-admins/route.ts"),
    source("app/api/me/route.ts"),
    source("db/schema.ts"),
    source("drizzle/0017_platform_admins.sql"),
  ]);

  assert.match(page, /Usuários Master/);
  assert.match(page, /Rafael Doneda/);
  assert.match(page, /Proprietário/);
  assert.match(platformAdmins, /PRIMARY_PLATFORM_OWNER_NAME = "Rafael Doneda"/);
  assert.match(platformAdmins, /ADDITIONAL_PLATFORM_ADMIN_LIMIT = 2/);
  assert.match(platformAdminApi, /upsertSupabaseUser/);
  assert.match(platformAdminApi, /A conta principal não pode ser removida/);
  assert.match(me, /Administrador geral/);
  assert.match(schema, /export const platformAdmins/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `platform_admins`/);
});

test("forces the dark booking experience for barbershops", async () => {
  const [booking, tenants] = await Promise.all([
    source("app/agendar/[slug]/public-booking.tsx"),
    source("app/api/tenants/route.ts"),
  ]);

  assert.match(booking, /businessType === "barbershop" \? "black" : store\.tenant\.theme/);
  assert.match(tenants, /businessType === "barbershop" \? "black" : requestedTheme/);
});

test("records inventory sales in finance and creates conflict-safe recurring clients", async () => {
  const [inventory, finance, clients, appointments, schema, migration, page] = await Promise.all([
    source("app/api/inventory/route.ts"),
    source("app/api/finance/route.ts"),
    source("app/api/clients/route.ts"),
    source("app/api/appointments/route.ts"),
    source("db/schema.ts"),
    source("drizzle/0020_inventory_sales_and_recurring_clients.sql"),
    source("app/page.tsx"),
  ]);

  assert.match(inventory, /action === "sell"/);
  assert.match(inventory, /INSERT INTO inventory_sales/);
  assert.match(inventory, /quantity = quantity -/);
  assert.match(finance, /productRevenue/);
  assert.match(finance, /serviceTransactions/);
  assert.match(clients, /weeklyDates\(weekday, 26\)/);
  assert.match(clients, /requestedStart < occupiedStart/);
  assert.match(appointments, /isPublicBooking/);
  assert.match(schema, /export const inventorySales/);
  assert.match(migration, /recurring_client_id/);
  assert.match(page, /Marcar vendido/);
  assert.match(page, /Cliente mensalista/);
});

test("ships an explicit one-time reset with no registered establishments", async () => {
  const reset = await source("drizzle/0021_reset_empty_tenant_catalog.sql");
  assert.match(reset, /DELETE FROM inventory_sales/);
  assert.match(reset, /DELETE FROM appointments/);
  assert.match(reset, /DELETE FROM clients/);
  assert.match(reset, /DELETE FROM tenants/);
  assert.doesNotMatch(reset, /DELETE FROM platform_admins/);
});

test("refreshes operational data automatically and restores the authenticated workspace", async () => {
  const page = await source("app/page.tsx");

  assert.match(page, /LIVE_REFRESH_INTERVAL = 15_000/);
  assert.match(page, /function useAutoRefresh/);
  assert.match(page, /document\.addEventListener\("visibilitychange"/);
  assert.match(page, /useAutoRefresh\(\(\) => \{\s*loadAgenda\(\);\s*loadDashboard\(\);/);
  assert.match(page, /salonos:last-view/);
  assert.match(page, /salonos:last-nav:/);
  assert.match(page, /setView\(authenticatedView\)/);
});

test("always restores the authenticated dashboard after a page reload", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /setView\(authenticatedView\)/);
  assert.match(page, /sessionResolved/);
  assert.match(page, /\.finally\(\(\) => setSessionResolved\(true\)\)/);
  assert.doesNotMatch(page, /if \(savedNav && allowedNav\.includes\(savedNav\)\) setActiveNav\(savedNav\);\s+setView\(authenticatedView\);/);
});

test("gives each establishment a cashier profile while keeping finance owner-only", async () => {
  const [page, access, config, staffAccess, storefront, notifications] = await Promise.all([
    source("app/page.tsx"),
    source("app/tenant-access.ts"),
    source("app/api/config/route.ts"),
    source("app/api/auth/manage-user/route.ts"),
    source("app/api/storefront/[slug]/route.ts"),
    source("app/api/notifications/route.ts"),
  ]);
  assert.match(page, /Adicionar caixa/);
  assert.match(page, /Financeiro · somente proprietário/);
  assert.match(page, /playBellSound/);
  assert.match(page, /items\.length > 99 \? "99\+"/);
  assert.match(access, /finance: false/);
  assert.match(config, /Somente o proprietário pode alterar equipe e permissões/);
  assert.match(config, /finance: false/);
  assert.match(staffAccess, /Somente o proprietário pode liberar acessos/);
  assert.match(storefront, /lower\(role\) != 'caixa'/);
  assert.match(notifications, /Notificações disponíveis somente para o proprietário/);
  assert.match(notifications, /quantity <= minimum_stock/);
});

test("uses fixed hourly slots, confirms completed visits and prepares WhatsApp delivery", async () => {
  const [page, appointments, clients, whatsapp] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/appointments/route.ts"),
    source("app/api/clients/route.ts"),
    source("app/whatsapp.ts"),
  ]);
  assert.match(page, /minute \+= 60/);
  assert.match(page, /CONFIRMAR ATENDIMENTO/);
  assert.match(page, /Veio e realizou/);
  assert.match(page, /inventorySections/);
  assert.match(appointments, /body\.time\.endsWith\(":00"\)/);
  assert.match(appointments, /isBlocked/);
  assert.match(clients, /time\.endsWith\(":00"\)/);
  assert.match(whatsapp, /whatsapp_outbox/);
  assert.match(whatsapp, /appointment_confirmation/);
});

test("records in-person payment methods and supports daily cash closing", async () => {
  const [page, appointments, inventory, finance, closing, schema, migration] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/appointments/route.ts"),
    source("app/api/inventory/route.ts"),
    source("app/api/finance/route.ts"),
    source("app/api/cash-closing/route.ts"),
    source("db/schema.ts"),
    source("drizzle/0023_cash_closing_and_payments.sql"),
  ]);
  assert.match(page, /Apenas registro/);
  assert.match(page, /Fechamento diário/);
  assert.match(page, /SOMENTE REGISTRO · SEM COBRANÇA/);
  assert.match(appointments, /Informe como o cliente pagou/);
  assert.match(inventory, /payment_method/);
  assert.match(finance, /paymentMethods/);
  assert.match(closing, /cash_closings/);
  assert.match(schema, /export const cashClosings/);
  assert.match(migration, /ALTER TABLE appointments ADD COLUMN payment_method/);
});

test("ships complete client profiles with no-show and retention controls", async () => {
  const [page, clients, appointments, schema, migration] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/clients/route.ts"),
    source("app/api/appointments/route.ts"),
    source("db/schema.ts"),
    source("drizzle/0024_client_profiles.sql"),
  ]);
  assert.match(page, /Alergias ou cuidados/);
  assert.match(page, /INATIVO HÁ MAIS DE 60 DIAS/);
  assert.match(page, /Bloquear novos agendamentos/);
  assert.match(page, /Convidar para retornar/);
  assert.match(clients, /isValidCpf/);
  assert.match(clients, /noShows/);
  assert.match(clients, /date\('now', '-60 days'\)/);
  assert.match(appointments, /blockedClient/);
  assert.match(appointments, /no_show/);
  assert.match(schema, /blockedReason/);
  assert.match(migration, /clients_tenant_cpf_unique/);
});


