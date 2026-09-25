import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[]; meta: { changes: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{ success: true; meta: { changes: number } }>;
};

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
const sql = connectionString
  ? postgres(connectionString, { max: 5, prepare: false, ssl: "require" })
  : null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, city TEXT NOT NULL, phone TEXT NOT NULL, owner_email TEXT, logo_key TEXT, business_type TEXT NOT NULL DEFAULT 'barbershop', theme TEXT NOT NULL DEFAULT 'black', active INTEGER NOT NULL DEFAULT 1, plan TEXT NOT NULL DEFAULT 'pro', created_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS appointments (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, cpf TEXT NOT NULL DEFAULT '', recurring_client_id BIGINT, barber TEXT NOT NULL, service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed', payment_method TEXT NOT NULL DEFAULT '', paid_at BIGINT, no_show INTEGER NOT NULL DEFAULT 0, created_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_unique ON appointments (tenant_id, barber, date, time)`,
  `CREATE TABLE IF NOT EXISTS services (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL, duration INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS clients (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, cpf TEXT NOT NULL DEFAULT '', birth_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', preferences TEXT NOT NULL DEFAULT '', allergies TEXT NOT NULL DEFAULT '', blocked INTEGER NOT NULL DEFAULT 0, blocked_reason TEXT NOT NULL DEFAULT '', is_monthly INTEGER NOT NULL DEFAULT 0, recurring_weekday INTEGER, recurring_time TEXT NOT NULL DEFAULT '', recurring_barber TEXT NOT NULL DEFAULT '', recurring_service TEXT NOT NULL DEFAULT '', created_at BIGINT NOT NULL, updated_at BIGINT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_phone_unique ON clients (tenant_id, phone)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS clients_tenant_cpf_unique ON clients (tenant_id, cpf) WHERE cpf != ''`,
  `CREATE TABLE IF NOT EXISTS barbers (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', photo_key TEXT, access_enabled INTEGER NOT NULL DEFAULT 0, access_must_change INTEGER NOT NULL DEFAULT 0, temporary_password_hash TEXT, role TEXT NOT NULL DEFAULT 'Barbeiro', commission INTEGER NOT NULL DEFAULT 30, services TEXT NOT NULL DEFAULT '[]', work_days TEXT NOT NULL DEFAULT '["2","3","4","5","6"]', work_start TEXT NOT NULL DEFAULT '09:00', work_end TEXT NOT NULL DEFAULT '18:00', break_start TEXT NOT NULL DEFAULT '', break_end TEXT NOT NULL DEFAULT '', time_off TEXT NOT NULL DEFAULT '[]', permissions TEXT NOT NULL DEFAULT '{"agenda":true,"clients":true,"inventory":false,"finance":false,"settings":false}', active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS business_hours (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, label TEXT NOT NULL, days TEXT NOT NULL, open TEXT NOT NULL, close TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, tenant_id TEXT, tenant_name TEXT NOT NULL, action TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL, actor_email TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_logs_tenant_idx ON audit_logs (tenant_id)`,
  `CREATE TABLE IF NOT EXISTS salonos_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS salonos_sessions_email_idx ON salonos_sessions (email)`,
  `CREATE TABLE IF NOT EXISTS platform_admins (email TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key_hash TEXT NOT NULL, namespace TEXT NOT NULL, window_started_at BIGINT NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_key_window_unique ON rate_limits (key_hash, window_started_at)`,
  `CREATE TABLE IF NOT EXISTS inventory_products (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Geral', quantity INTEGER NOT NULL DEFAULT 0, minimum_stock INTEGER NOT NULL DEFAULT 0, cost INTEGER NOT NULL DEFAULT 0, sale_price INTEGER NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inventory_sales (id BIGSERIAL PRIMARY KEY, sale_token TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, product_id BIGINT NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, total_amount INTEGER NOT NULL, sale_date TEXT NOT NULL, sold_at BIGINT NOT NULL, sold_by TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS cash_closings (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, closing_date TEXT NOT NULL, expected_total INTEGER NOT NULL, cash_total INTEGER NOT NULL DEFAULT 0, pix_total INTEGER NOT NULL DEFAULT 0, debit_total INTEGER NOT NULL DEFAULT 0, credit_total INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', closed_by TEXT NOT NULL, closed_at BIGINT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cash_closings_tenant_date_unique ON cash_closings (tenant_id, closing_date)`,
  `CREATE TABLE IF NOT EXISTS whatsapp_outbox (id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, event TEXT NOT NULL, recipient TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting_configuration', created_at BIGINT NOT NULL, sent_at BIGINT)`,
];

let schemaReady: Promise<void> | null = null;

function database() {
  if (!sql) throw new Error("POSTGRES_URL não configurada na Vercel");
  schemaReady ??= (async () => {
    for (const statement of schemaStatements) await sql.unsafe(statement);
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail) {
      await sql.unsafe(
        `INSERT INTO platform_admins (email, display_name, created_at) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`,
        [adminEmail, process.env.PLATFORM_ADMIN_NAME || "SalonOS Master", Date.now()],
      );
    }
  })();
  return sql;
}

function translate(input: string, values: unknown[]) {
  let query = input.trim().replace(/;$/, "");
  const pragma = query.match(/^PRAGMA\s+table_info\(([^)]+)\)$/i);
  if (pragma) {
    return {
      query: `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      values: [pragma[1]],
    };
  }
  query = query
    .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/date\('now',\s*'-([0-9]+) days'\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')::text")
    .replace(/date\('now'\)/gi, "CURRENT_DATE::text")
    .replace(/strftime\('%H:%M',\s*([a-z_]+)\s*\/\s*1000,\s*'unixepoch',\s*'-3 hours'\)/gi, "to_char(to_timestamp($1 / 1000) AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')")
    .replace(/instr\(','\s*\|\|\s*days\s*\|\|\s*',',\s*','\s*\|\|\s*\?\s*\|\|\s*','\)\s*>\s*0/gi, "POSITION(',' || ? || ',' IN ',' || days || ',') > 0")
    .replace(/\bAS\s+([A-Za-z_]*[A-Z][A-Za-z0-9_]*)/g, 'AS "$1"');
  if (/^INSERT\s+INTO/i.test(query) && /INSERT\s+OR\s+IGNORE/i.test(input) && !/ON\s+CONFLICT/i.test(query)) {
    query += " ON CONFLICT DO NOTHING";
  }
  let index = 0;
  query = query.replace(/\?/g, () => `$${++index}`);
  return { query, values };
}

class Statement implements BoundStatement {
  constructor(private readonly source: string, private values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.source, values); }
  private async execute() {
    const client = database();
    await schemaReady;
    const translated = translate(this.source, this.values);
    return client.unsafe(translated.query, translated.values as never[]);
  }
  async all<T = Record<string, unknown>>() {
    const rows = await this.execute();
    return { results: Array.from(rows) as T[], meta: { changes: rows.count || 0 } };
  }
  async first<T = Record<string, unknown>>() {
    const result = await this.all<T>();
    return result.results[0] || null;
  }
  async run() {
    const rows = await this.execute();
    return { success: true as const, meta: { changes: rows.count || 0 } };
  }
}

const DB = {
  prepare(source: string) { return new Statement(source); },
  async batch(statements: BoundStatement[]) { return Promise.all(statements.map((statement) => statement.run())); },
};

let storageReady: Promise<ReturnType<ReturnType<typeof createClient>["storage"]["from"]>> | null = null;

function storage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase Storage não configurado na Vercel");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "salonos-media";
  storageReady ??= (async () => {
    const { error } = await client.storage.createBucket(bucket, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
    return client.storage.from(bucket);
  })();
  return storageReady;
}

const MEDIA = {
  async get(key: string) {
    const { data, error } = await (await storage()).download(key);
    if (error || !data) return null;
    return {
      body: data.stream(),
      httpEtag: `"${key}"`,
      writeHttpMetadata(headers: Headers) { headers.set("content-type", data.type || "application/octet-stream"); },
    };
  },
  async put(key: string, body: ReadableStream, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = await new Response(body).arrayBuffer();
    const { error } = await (await storage()).upload(key, bytes, {
      contentType: options?.httpMetadata?.contentType,
      upsert: true,
    });
    if (error) throw error;
  },
  async delete(keys: string | string[]) {
    const { error } = await (await storage()).remove(Array.isArray(keys) ? keys : [keys]);
    if (error) throw error;
  },
  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix || "";
    const slash = prefix.lastIndexOf("/");
    const folder = slash >= 0 ? prefix.slice(0, slash) : "";
    const { data, error } = await (await storage()).list(folder, { limit: 1000 });
    if (error) throw error;
    return { objects: (data || []).filter((item) => `${folder ? `${folder}/` : ""}${item.name}`.startsWith(prefix)).map((item) => ({ key: `${folder ? `${folder}/` : ""}${item.name}` })) };
  },
};

export const env = new Proxy({ DB, MEDIA } as Record<string, unknown>, {
  get(target, property: string) {
    if (property in target) return target[property];
    return process.env[property];
  },
}) as { DB: typeof DB; MEDIA: typeof MEDIA } & Record<string, string>;
