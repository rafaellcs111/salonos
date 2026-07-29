import { getBarberOSOwner } from "../../../chatgpt-auth";
import { upsertSupabaseUser } from "../../../supabase-auth";

export async function POST(request: Request) {
  const owner = await getBarberOSOwner();
  if (!owner) return Response.json({ error: "Acesso restrito ao proprietário" }, { status: 403 });
  const body = await request.json() as { email?: string; password?: string; displayName?: string };
  if (!body.email || !body.password || body.password.length < 8) {
    return Response.json({ error: "Informe um e-mail e uma senha com pelo menos 8 caracteres" }, { status: 400 });
  }
  try {
    await upsertSupabaseUser(body.email, body.password, body.displayName || body.email);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar a senha" }, { status: 400 });
  }
}
