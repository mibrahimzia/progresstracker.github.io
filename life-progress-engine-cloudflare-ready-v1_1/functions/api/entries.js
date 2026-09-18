import { extractEventsWithGroq } from "../../lib/groq.js";
import { applyEvent } from "../../lib/engine.js";
import { catchUpToToday, commitStates } from "../../lib/store.js";
import { DIMENSIONS, EVENT_TYPES } from "../../lib/config.js";

const validDims = new Set(DIMENSIONS.map((d) => d.key));
const validTypes = new Set(EVENT_TYPES);

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid request body" }, 400);
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const mode = body.mode === "manual" ? "manual" : "llm";
  const db = env.DB;

  let events = [];
  let source = mode;

  if (mode === "llm") {
    if (!rawText) return json({ error: "text is required for llm mode" }, 400);
    try {
      events = await extractEventsWithGroq(env, rawText);
    } catch (err) {
      return json(
        { error: `Groq extraction failed: ${err.message}. Try mode: "manual" instead.` },
        502
      );
    }
    if (events.length === 0) {
      return json({ error: "No events extracted — try rephrasing, or use manual mode." }, 200);
    }
  } else {
    const manualEvents = Array.isArray(body.events) ? body.events : [];
    events = manualEvents.map(sanitizeManualEvent).filter(Boolean);
    if (events.length === 0) {
      return json({ error: "No valid manual events provided" }, 400);
    }
    source = "manual";
  }

  // Log the entry (raw text may be empty for pure-manual submissions)
  const entryRes = await db
    .prepare("INSERT INTO entries (created_at, raw_text, source) VALUES (?, ?, ?)")
    .bind(new Date().toISOString(), rawText, source)
    .run();
  const entryId = entryRes.meta.last_row_id;

  // Catch up decay to today, then apply each extracted event in sequence.
  let { states, threshold } = await catchUpToToday(db);

  const insertedEvents = [];
  for (const ev of events) {
    const { newStates, credit } = applyEvent(states, ev);
    states = newStates;
    insertedEvents.push({ ...ev, credit });
  }

  const insertStmts = insertedEvents.map((ev) =>
    db
      .prepare(
        `INSERT INTO events
        (entry_id, created_at, dimension, event_type, magnitude, quality, evidence, significance, persistence, alignment, confidence, explanation, credit, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
      .bind(
        entryId,
        new Date().toISOString(),
        ev.dimension,
        ev.type,
        ev.magnitude,
        ev.quality,
        ev.evidence,
        ev.significance,
        ev.persistence,
        ev.alignment,
        ev.confidence,
        ev.explanation || "",
        ev.credit
      )
  );
  if (insertStmts.length > 0) await db.batch(insertStmts);

  const pointNote = insertedEvents.map((ev) => ev.explanation).filter(Boolean).join(" · ").slice(0, 700);
  const trajectory = await commitStates(db, states, threshold, entryId, pointNote || `${source} update`);

  return json(
    {
      ok: true,
      entryId,
      eventsApplied: insertedEvents.length,
      events: insertedEvents,
      trajectory,
    },
    200
  );
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function sanitizeManualEvent(e) {
  if (!e || !validDims.has(e.dimension) || !validTypes.has(e.type)) return null;
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
