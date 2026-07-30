import { getBarberOSOwner, getChatGPTUser } from "../../chatgpt-auth";
import { isPrimaryPlatformOwner } from "../../platform-admins";
import { getTenantAccess } from "../../tenant-access";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const platformOwner = await getBarberOSOwner();
  if (platformOwner) {
    return Response.json({
      ...platformOwner,
      isOwner: true,
      ownerRole: isPrimaryPlatformOwner(platformOwner.email) ? "Proprietário" : "Administrador geral",
      role: "platform_owner",
      tenantId: null,
      tenantName: null,
      tenantSlug: null,
    });
  }
  const access = await getTenantAccess();
  if (!access) {
    return Response.json(
      { error: "Sua conta ainda não está vinculada a uma barbearia" },
      { status: 403 },
    );
  }
  return Response.json({
    ...user,
    isOwner: false,
    tenantId: access.tenantId,
    tenantName: access.tenantName,
    tenantSlug: access.tenantSlug,
    businessType: access.businessType,
    theme: access.theme,
    plan: access.plan,
    role: access.role,
    staffName: access.staffName,
    mustChangePassword: access.mustChangePassword,
    permissions: access.permissions,
  });
}

