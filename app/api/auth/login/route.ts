import { loginWithPassword, sessionCookies } from "../../../supabase-auth";
import {
  consumeRateLimit,
  rateLimitResponse,
  requestClientAddress,
} from "../../../security";

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  if (!body.email || !body.password) return Response.json({ error: "Informe e-mail e senha" }, { status: 400 });
  const normalizedEmail = body.email.trim().toLowerCase();
  const rateLimit = await consumeRateLimit({
    namespace: "auth-login",
    identifier: `${requestClientAddress(request)}:${normalizedEmail}`,
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.");
  }
  try {
    const result = await loginWithPassword(normalizedEmail, body.password);
    const response = Response.json({ ok: true, user: result.user });
    sessionCookies(result.token).forEach((cookie) => response.headers.append("Set-Cookie", cookie));
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível entrar" }, { status: 401 });
  }
}
