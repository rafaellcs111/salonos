import { env } from "cloudflare:workers";
import { upsertSupabaseUser } from "../../../supabase-auth";
import { getTenantAccess } from "../../../tenant-access";

export async function POST(request: Request) {
  const access = await getTenantAccess();
  if (!access || access.role !== "staff") {
    return Response.json({ error: "Acesso restrito ao profissional autenticado" }, { status: 403 });
  }
  const body = await request.json() as { password?: string; confirmation?: string };
  const password = String(body.password || "");
  if (password.length < 8) {
    return Response.json({ error: "A nova senha deve ter pelo menos 8 caracteres" }, { status: 400 });
  }
  if (password === "12345678") {
    return Response.json({ error: "Escolha uma senha diferente da senha provisória" }, { status: 400 });
  }
  if (password !== body.confirmation) {
    return Response.json({ error: "As senhas não coincidem" }, { status: 400 });
  }
  try {
    await upsertSupabaseUser(access.user.email, password, access.staffName || access.user.displayName || access.user.email);
    await env.DB.prepare(
      `UPDATE barbers SET access_must_change = 0
       WHERE tenant_id = ? AND lower(email) = lower(?)`,
    ).bind(access.tenantId, access.user.email).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível alterar a senha" }, { status: 400 });
  }
}
