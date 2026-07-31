import { env } from "cloudflare:workers";
import { getBarberOSOwner, getChatGPTUser, type ChatGPTUser } from "./chatgpt-auth";

export type TenantPermission = "agenda" | "clients" | "inventory" | "finance" | "settings";
export type TenantPermissions = Record<TenantPermission, boolean>;

export type TenantAccess = {
  user: ChatGPTUser;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  businessType: "salon" | "barbershop";
  theme: "black" | "white";
  plan: string;
  isPlatformOwner: boolean;
  role: "platform_owner" | "tenant_owner" | "staff";
  staffName: string | null;
  mustChangePassword: boolean;
  permissions: TenantPermissions;
};

export async function getTenantAccess(
  requestedTenant?: string | null,
  requiredPermission?: TenantPermission,
): Promise<TenantAccess | null> {
  const user = await getChatGPTUser();
  if (!user) return null;

  const platformOwner = await getBarberOSOwner();
  if (platformOwner) {
    const tenantId = requestedTenant?.trim() || "chosen";
    const tenant = await env.DB.prepare(
      "SELECT id, name, slug, business_type AS businessType, theme, plan FROM tenants WHERE id = ? LIMIT 1",
    ).bind(tenantId).first<{ id: string; name: string; slug: string; businessType: "salon" | "barbershop"; theme: "black" | "white"; plan: string }>();
    if (!tenant) return null;
    return {
      user,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      businessType: tenant.businessType,
      theme: tenant.theme,
      plan: tenant.plan,
      isPlatformOwner: true,
      role: "platform_owner",
      staffName: null,
      mustChangePassword: false,
      permissions: fullPermissions(),
    };
  }

  const tenant = await env.DB.prepare(
    `SELECT id, name, slug, business_type AS businessType, theme, plan FROM tenants
     WHERE lower(owner_email) = lower(?) AND active = 1
       AND (? = '' OR id = ?)
     ORDER BY created_at LIMIT 1`,
  ).bind(user.email, requestedTenant?.trim() || "", requestedTenant?.trim() || "").first<{
    id: string;
    name: string;
    slug: string;
    businessType: "salon" | "barbershop";
    theme: "black" | "white";
    plan: string;
  }>();
  if (tenant) {
    return {
      user,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      businessType: tenant.businessType,
      theme: tenant.theme,
      plan: tenant.plan,
      isPlatformOwner: false,
      role: "tenant_owner",
      staffName: null,
      mustChangePassword: false,
      permissions: fullPermissions(),
    };
  }

  const staff = await env.DB.prepare(
    `SELECT t.id, t.name AS tenantName, t.slug, t.business_type AS businessType,
      t.theme, t.plan, b.name AS staffName, b.permissions, b.access_must_change AS accessMustChange
     FROM barbers b
     INNER JOIN tenants t ON t.id = b.tenant_id
     WHERE lower(b.email) = lower(?) AND b.active = 1 AND b.access_enabled = 1 AND t.active = 1
       AND (? = '' OR t.id = ?)
     ORDER BY b.id LIMIT 1`,
  ).bind(user.email, requestedTenant?.trim() || "", requestedTenant?.trim() || "").first<{
    id: string;
    tenantName: string;
    slug: string;
    staffName: string;
    permissions: string;
    businessType: "salon" | "barbershop";
    theme: "black" | "white";
    plan: string;
    accessMustChange: number;
  }>();
  if (!staff) return null;
  const permissions = parsePermissions(staff.permissions);
  if (requiredPermission && !permissions[requiredPermission]) return null;

  return {
    user,
    tenantId: staff.id,
    tenantName: staff.tenantName,
    tenantSlug: staff.slug,
    businessType: staff.businessType,
    theme: staff.theme,
    plan: staff.plan,
    isPlatformOwner: false,
    role: "staff",
    staffName: staff.staffName,
    mustChangePassword: Boolean(staff.accessMustChange),
    permissions,
  };
}

function fullPermissions(): TenantPermissions {
  return { agenda: true, clients: true, inventory: true, finance: true, settings: true };
}

function parsePermissions(value: string): TenantPermissions {
  try {
    const parsed = JSON.parse(value);
    return {
      agenda: Boolean(parsed.agenda),
      clients: Boolean(parsed.clients),
      inventory: Boolean(parsed.inventory),
      finance: false,
      settings: false,
    };
  } catch {
    return { agenda: false, clients: false, inventory: false, finance: false, settings: false };
  }
}
