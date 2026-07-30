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

test("provisions staff access with a one-time temporary password", async () => {
  const [page, manageUser, changePassword, tenantAccess, me, config, migration] = await Promise.all([
    source("app/page.tsx"),
    source("app/api/auth/manage-user/route.ts"),
    source("app/api/auth/change-password/route.ts"),
    source("app/tenant-access.ts"),
    source("app/api/me/route.ts"),
    source("app/api/config/route.ts"),
    source("drizzle/0016_staff_access.sql"),
  ]);

  assert.match(manageUser, /const TEMPORARY_PASSWORD = "12345678"/);
  assert.match(manageUser, /getTenantAccess\(body\.tenant, "settings"\)/);
  assert.match(manageUser, /access_enabled = 1, access_must_change = 1/);
  assert.match(manageUser, /getBarberOSOwner/);
  assert.match(changePassword, /password === "12345678"/);
  assert.match(changePassword, /access_must_change = 0/);
  assert.match(tenantAccess, /b\.access_enabled = 1/);
  assert.match(me, /mustChangePassword/);
  assert.match(config, /access_enabled AS accessEnabled/);
  assert.match(config, /revokedEmails/);
  assert.match(migration, /access_must_change/);
  assert.match(page, /function PasswordChangeGate/);
  assert.match(page, /Senha provisória padrão: 12345678/);
});

