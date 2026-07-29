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
  assert.match(appointments, /Hor.rio indispon.vel/);
  assert.match(appointments, /status != 'cancelled'/);
  assert.match(tenants, /getBarberOSOwner/);
  assert.match(tenants, /UPDATE tenants SET name/);
  assert.match(tenants, /owner_email/);
  assert.match(publicBooking, /api\/storefront/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});
