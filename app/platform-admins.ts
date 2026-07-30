import { env } from "cloudflare:workers";

export const PRIMARY_PLATFORM_OWNER_EMAIL = "rafaelviamaquinas@gmail.com";
export const PRIMARY_PLATFORM_OWNER_NAME = "Rafael Doneda";
export const ADDITIONAL_PLATFORM_ADMIN_LIMIT = 2;

export type PlatformAdmin = {
  email: string;
  displayName: string;
  createdAt: number;
};

export async function ensurePlatformAdminsTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_admins (
    email TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
}

export async function findPlatformAdmin(email: string) {
  await ensurePlatformAdminsTable();
  return env.DB.prepare(
    "SELECT email, display_name AS displayName, created_at AS createdAt FROM platform_admins WHERE lower(email) = lower(?) LIMIT 1",
  ).bind(email).first<PlatformAdmin>();
}

export function isPrimaryPlatformOwner(email: string) {
  return email.trim().toLowerCase() === PRIMARY_PLATFORM_OWNER_EMAIL;
}

