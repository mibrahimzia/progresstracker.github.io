import { DIMENSIONS, EVENT_TYPES } from "./config.js";

const SYSTEM_PROMPT = `You are the interpretation layer of a personal "life trajectory engine".
Your ONLY job is to convert a natural-language update into structured events.
You must NOT decide a final score or trajectory number — a separate deterministic
engine does that. You only extract evidence.

Valid dimensions: ${DIMENSIONS.map((d) => d.key).join(", ")}
Valid event types: ${EVENT_TYPES.join(", ")}

Rules:
- Extract one event per meaningful episode/outcome. Do not try to classify every
  minute of the day (skip bathroom breaks, meals, routine chores).
- Ordinary recovery (rest, entertainment after real work was done) is "neutral"
  or "maintenance", not "negative" — do not penalize legitimate recovery.
- Effort without outcome should score low on "significance", not be omitted.
- A failed attempt that produced real learning is still a "positive" event on
  the relevant dimension, scored lower than an equivalent success.
- Exploration only earns credit if it produced a conclusion, eliminated a
  direction, or produced reusable knowledge — otherwise keep magnitude/significance low.
- If you are uncertain about a judgment, keep confidence low rather than
  inventing certainty.
- Return STRICT JSON only, matching this shape, and nothing else:

{
  "events": [
    {
      "dimension": "one of the valid dimensions",
      "type": "one of the valid event types",
      "magnitude": 0.0-1.0,
      "quality": 0.0-1.0,
      "evidence": 0.0-1.0,
      "significance": 0.0-1.0,
      "persistence": 0.0-1.0,
      "alignment": 0.0-1.0,
      "confidence": 0.0-1.0,
      "explanation": "one sentence, why this event and this scoring"
    }
  ]
}`;

/**
 * Calls the Groq API to extract structured events from raw text.
 * Requires env.GROQ_API_KEY. Model is configurable via env.GROQ_MODEL
 * (falls back to a fast/free-tier-friendly default).
 */
export async function extractEventsWithGroq(env, rawText) {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  const model = (env.GROQ_MODEL || "openai/gpt-oss-120b").trim();
  if (!model) throw new Error("GROQ_MODEL is not configured");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawText },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq API returned no content");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Groq API returned non-JSON content");
  }

  const events = Array.isArray(parsed.events) ? parsed.events : [];
  return events.map(sanitizeEvent).filter(Boolean);
}

const validDims = new Set(DIMENSIONS.map((d) => d.key));
const validTypes = new Set(EVENT_TYPES);

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function sanitizeEvent(e) {
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
    confidence: clamp01(e.confidence),
    explanation: typeof e.explanation === "string" ? e.explanation.slice(0, 500) : "",
  };
}
