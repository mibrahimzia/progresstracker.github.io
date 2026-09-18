import { verifyPassword, createSessionToken, sessionCookieHeader, isPasswordHashConfigured } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid request body" }, 400); }
  const password = body?.password;
  if (typeof password !== "string" || password.length === 0) return json({ error: "passphrase required" }, 400);

  if (!isPasswordHashConfigured(env.AUTH_PASSWORD_HASH)) {
    return json({ error: "server authentication is not configured correctly" }, 500);
  }
  if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) {
    return json({ error: "server session configuration is invalid" }, 500);
  }

  const ok = await verifyPassword(password, env.AUTH_PASSWORD_HASH);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 350));
    return json({ error: "invalid credentials" }, 401);
  }

  const token = await createSessionToken(env.SESSION_SECRET, { sub: "owner" });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": sessionCookieHeader(token) },
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
