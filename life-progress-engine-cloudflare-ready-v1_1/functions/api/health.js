import { isPasswordHashConfigured } from "../../lib/auth.js";

export async function onRequestGet({ env }) {
  let dbOk = false;
  let dbTables = 0;
  try {
    const result = await env.DB.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('entries','events','dimension_state','trajectory_history','meta')").first();
    dbTables = Number(result?.count || 0);
    dbOk = dbTables === 5;
  } catch {}

  return new Response(JSON.stringify({
    ok: dbOk && isPasswordHashConfigured(env.AUTH_PASSWORD_HASH) && typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= 32,
    authHashConfigured: isPasswordHashConfigured(env.AUTH_PASSWORD_HASH),
    sessionSecretConfigured: typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= 32,
    groqConfigured: typeof env.GROQ_API_KEY === "string" && env.GROQ_API_KEY.startsWith("gsk_"),
    groqModel: (typeof env.GROQ_MODEL === "string" && env.GROQ_MODEL.trim()) || "openai/gpt-oss-120b",
    database: { ok: dbOk, expectedTables: 5, foundTables: dbTables }
  }, null, 2), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
