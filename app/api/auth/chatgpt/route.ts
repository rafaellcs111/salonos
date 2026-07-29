export async function GET(request: Request) {
  const returnTo = encodeURIComponent("/?emergency=1");
  const response = new Response(null, { status: 303, headers: { Location: new URL(`/signin-with-chatgpt?return_to=${returnTo}`, request.url).toString() } });
  response.headers.append("Set-Cookie", "salonos_auth_mode=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  response.headers.append("Set-Cookie", "salonos_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return response;
}
