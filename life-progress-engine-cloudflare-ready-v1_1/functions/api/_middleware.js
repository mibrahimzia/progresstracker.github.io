import { requireSession } from "../../lib/auth.js";

export async function onRequest(context) {
  const { request, next, env } = context;
  const path = new URL(request.url).pathname;
  if (path === "/api/login" || path === "/api/health") return next();
  const session = await requireSession(request, env);
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  context.data.session = session;
  return next();
}
