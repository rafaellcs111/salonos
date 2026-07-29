import { loginWithPassword, sessionCookies } from "../../../supabase-auth";

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  if (!body.email || !body.password) return Response.json({ error: "Informe e-mail e senha" }, { status: 400 });
  try {
    const result = await loginWithPassword(body.email, body.password);
    const response = Response.json({ ok: true, user: result.user });
    sessionCookies(result.token).forEach((cookie) => response.headers.append("Set-Cookie", cookie));
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível entrar" }, { status: 401 });
  }
}
