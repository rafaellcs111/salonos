import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import type { ChatGPTUser } from "./chatgpt-auth";

const SESSION_COOKIE = "salonos_session";
const MODE_COOKIE = "salonos_auth_mode";
const SESSION_DAYS = 30;

function config() {
  const runtime = env as unknown as Record<string, string>;
  return {
    url: runtime.SUPABASE_URL,
    publishableKey: runtime.SUPABASE_PUBLISHABLE_KEY,
    secretKey: runtime.SUPABASE_SECRET_KEY,
  };
}

async function ensureSessionTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS salonos_sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS salonos_sessions_email_idx ON salonos_sessions (email)"),
  ]);
}

export async function getSalonOSSessionUser(): Promise<{ mode: "local" | "chatgpt"; user: ChatGPTUser | null }> {
  const requestHeaders = await headers();
  const cookies = parseCookies(requestHeaders.get("cookie") || "");
  if (cookies[MODE_COOKIE] !== "local") return { mode: "chatgpt", user: null };
  const token = cookies[SESSION_COOKIE];
  if (!token) return { mode: "local", user: null };
  await ensureSessionTable();
  const session = await env.DB.prepare(
    "SELECT email, display_name AS displayName, expires_at AS expiresAt FROM salonos_sessions WHERE token_hash = ? LIMIT 1",
  ).bind(await digest(token)).first<{ email: string; displayName: string; expiresAt: number }>();
  if (!session || Number(session.expiresAt) < Date.now()) return { mode: "local", user: null };
  return {
    mode: "local",
    user: { email: session.email, displayName: session.displayName || session.email, fullName: session.displayName || null },
  };
}

export async function loginWithPassword(email: string, password: string) {
  const { url, publishableKey } = config();
  if (!url || !publishableKey) throw new Error("AutenticaÃ§Ã£o ainda nÃ£o configurada");
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publishableKey },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  const data = await response.json() as { user?: { email?: string; user_metadata?: Record<string, unknown> }; error_description?: string; msg?: string };
  if (!response.ok || !data.user?.email) throw new Error("E-mail ou senha invÃ¡lidos");
  const token = randomToken();
  const displayName = String(data.user.user_metadata?.display_name || data.user.user_metadata?.name || data.user.email);
  await ensureSessionTable();
  await env.DB.prepare(
    "INSERT INTO salonos_sessions (token_hash, email, display_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(await digest(token), data.user.email.toLowerCase(), displayName, Date.now() + SESSION_DAYS * 86400000, Date.now()).run();
  return {
    token,
    user: { email: data.user.email, displayName, fullName: displayName },
  };
}

export async function logoutLocalSession() {
  const requestHeaders = await headers();
  const token = parseCookies(requestHeaders.get("cookie") || "")[SESSION_COOKIE];
  if (token) {
    await ensureSessionTable();
    await env.DB.prepare("DELETE FROM salonos_sessions WHERE token_hash = ?").bind(await digest(token)).run();
  }
}

export async function upsertSupabaseUser(email: string, password: string, displayName: string) {
  const { url, secretKey } = config();
  if (!url || !secretKey) throw new Error("Supabase nÃ£o configurado");
  const normalizedEmail = email.trim().toLowerCase();
  const supabase = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  let existingId: string | undefined;
  for (let page = 1; page <= 10 && !existingId; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`NÃ£o foi possÃ­vel consultar a conta: ${error.message}`);
    existingId = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)?.id;
    if (data.users.length < 100) break;
  }

  const attributes = {
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  };
  const result = existingId
    ? await supabase.auth.admin.updateUserById(existingId, attributes)
    : await supabase.auth.admin.createUser(attributes);
  if (result.error) {
    throw new Error(`NÃ£o foi possÃ­vel salvar a senha do gestor: ${result.error.message}`);
  }
}

export async function deleteSupabaseUser(email: string) {
  const { url, secretKey } = config();
  if (!url || !secretKey) return;
  const normalizedEmail = email.trim().toLowerCase();
  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`NÃ£o foi possÃ­vel consultar a conta: ${error.message}`);
    const existing = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (existing) {
      const result = await supabase.auth.admin.deleteUser(existing.id);
      if (result.error) throw new Error(`NÃ£o foi possÃ­vel remover a credencial: ${result.error.message}`);
      return;
    }
    if (data.users.length < 100) return;
  }
}

export function sessionCookies(token: string) {
  const maxAge = SESSION_DAYS * 86400;
  return [
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
    `${MODE_COOKIE}=local; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`,
  ];
}

export function clearedSessionCookies() {
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${MODE_COOKIE}=local; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
  ];
}

function parseCookies(value: string) {
  return Object.fromEntries(value.split(";").map((part) => part.trim().split("=")).filter(([key]) => key));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

