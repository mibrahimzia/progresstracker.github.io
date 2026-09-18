import { DIMENSIONS, EVENT_TYPES } from "../../lib/config.js";
import { applyEvent } from "../../lib/engine.js";
import { catchUpToToday, commitStates } from "../../lib/store.js";

const validDims = new Set(DIMENSIONS.map((d) => d.key));
const validTypes = new Set(EVENT_TYPES);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10));
  const { results } = await env.DB.prepare(
    `SELECT e.*, en.raw_text FROM events e
     LEFT JOIN entries en ON en.id = e.entry_id
     WHERE e.status = 'active'
     ORDER BY e.created_at DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return json({ events: results || [] }, 200);
}

// Correct an existing event: marks it superseded, applies the reverse of its
// original credit, then applies a new event with corrected fields. This never
// rewrites history silently — both the old and new rows remain in the table.
export async function onRequestPatch({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const { eventId, correction } = body;
  if (!eventId || !correction) return json({ error: "eventId and correction are required" }, 400);
  if (!validDims.has(correction.dimension) || !validTypes.has(correction.type)) {
    return json({ error: "invalid dimension or type in correction" }, 400);
  }

  const db = env.DB;
  const original = await db.prepare("SELECT * FROM events WHERE id = ? AND status = 'active'").bind(eventId).first();
  if (!original) return json({ error: "event not found or already superseded" }, 404);

  let { states, threshold } = await catchUpToToday(db);

  // Reverse the original credit on its original dimension.
  const reversed = { ...states, [original.dimension]: clamp01((states[original.dimension] ?? 0) - original.credit) };

  // Apply the corrected event.
  const correctedEvent = sanitizeManualEvent(correction);
  const { newStates, credit } = applyEvent(reversed, correctedEvent);

  await db.prepare("UPDATE events SET status = 'superseded' WHERE id = ?").bind(eventId).run();

  const insertRes = await db
    .prepare(
      `INSERT INTO events
      (entry_id, created_at, dimension, event_type, magnitude, quality, evidence, significance, persistence, alignment, confidence, explanation, credit, status, corrected_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
    )
    .bind(
      original.entry_id,
      new Date().toISOString(),
      correctedEvent.dimension,
      correctedEvent.type,
      correctedEvent.magnitude,
      correctedEvent.quality,
      correctedEvent.evidence,
      correctedEvent.significance,
      correctedEvent.persistence,
      correctedEvent.alignment,
      correctedEvent.confidence,
      correctedEvent.explanation || "(corrected)",
      credit,
      eventId
    )
    .run();

  const trajectory = await commitStates(db, newStates, threshold);

  return json({ ok: true, newEventId: insertRes.meta.last_row_id, trajectory }, 200);
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function sanitizeManualEvent(e) {
  return {
    dimension: e.dimension,
    type: e.type,
    magnitude: clamp01(e.magnitude),
    quality: clamp01(e.quality),
    evidence: clamp01(e.evidence),
    significance: clamp01(e.significance),
    persistence: clamp01(e.persistence),
    alignment: clamp01(e.alignment),
    confidence: clamp01(e.confidence ?? 1),
    explanation: typeof e.explanation === "string" ? e.explanation.slice(0, 500) : "",
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
