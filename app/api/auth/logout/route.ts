import { clearedSessionCookies, logoutLocalSession } from "../../../supabase-auth";

export async function GET(request: Request) {
  await logoutLocalSession();
  const response = new Response(null, { status: 303, headers: { Location: new URL("/", request.url).toString() } });
  clearedSessionCookies().forEach((cookie) => response.headers.append("Set-Cookie", cookie));
  return response;
}
