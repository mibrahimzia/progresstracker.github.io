// All numeric constants here are CALIBRATION CANDIDATES per the spec —
// edit freely, nothing else in the codebase needs to change when you do.
// Weights should sum to 1.0 across DIMENSIONS.

export const DIMENSIONS = [
  { key: "creation", name: "Creation / Entrepreneurship", weight: 0.19 },
  { key: "technical", name: "Technical Capability", weight: 0.15 },
  { key: "execution", name: "Execution", weight: 0.14 },
  { key: "financial", name: "Financial Progress", weight: 0.10 },
  { key: "leadership", name: "Leadership / Influence", weight: 0.08 },
  { key: "independence", name: "Independence", weight: 0.09 },
  { key: "sustainability", name: "Sustainability", weight: 0.09 },
  { key: "relationships", name: "Relationships / Social Capital", weight: 0.05 },
  // Added beyond the spec's original 8 — flag if you don't want these:
  { key: "academic", name: "Academic Standing", weight: 0.06 },
  { key: "optionality", name: "Optionality / Network", weight: 0.05 },
];
// academic: kept separate & lightly weighted so grades don't get folded into
//   Technical Capability (the spec explicitly warns against grades dominating).
// optionality: inbound opportunities — offers, intros, inbound interest, doors
//   opened — distinct from Independence (which is about self-sufficiency) and
//   from Relationships (which is about specific people/trust, not pipeline).

export const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);

export const ENGINE_CONFIG = {
  // Event credit formula (spec §13)
  EVENT_SCALE: 0.14,
  DIMINISHING_EXPONENT: 0.55,
  QUALITY_WEIGHTS: {
    quality: 0.25,
    evidence: 0.20,
    significance: 0.30,
    persistence: 0.15,
    alignment: 0.10,
  },
  NEGATIVE_EVENT_MULTIPLIER: 0.85, // negative events hit slightly softer than an equal-magnitude positive helps (Principle E: decay/setbacks aren't punitive)

  // Decay (spec §22) — applied per elapsed day since the last update
  BASE_DECAY: 0.0035,
  DECAY_STATE_FLOOR: 0.65,
  DECAY_STATE_SCALE: 0.70,
  DIMENSION_DECAY_FACTOR: {
    // dimensions that erode faster if untouched vs. ones that hold steady
    creation: 1.1,
    technical: 0.9,
    execution: 1.2,
    financial: 0.6,
    leadership: 0.8,
    independence: 0.5,
    sustainability: 1.3,
    relationships: 0.7,
    academic: 0.8,
    optionality: 1.0,
  },

  // Aggregation (spec §11)
  AGG_ARITHMETIC_WEIGHT: 0.80,
  AGG_GEOMETRIC_WEIGHT: 0.20,
  FOUNDATION_MODIFIER_BASE: 0.90,
  FOUNDATION_MODIFIER_SCALE: 0.10, // F = BASE + SCALE * sqrt(execution * sustainability)

  // Threshold adaptation (spec §23-24)
  THRESHOLD_INITIAL: 0.60,
  THRESHOLD_MARGIN: 0.15, // threshold trails the slow moving average by this much
  THRESHOLD_ADAPT_RATE: 0.015, // per day, applied to the gap vs. target
  THRESHOLD_MIN: 0.30,
  THRESHOLD_MAX: 0.85,
  THRESHOLD_LOOKBACK_DAYS: 30, // moving average window the threshold chases
};

export const EVENT_TYPES = ["positive", "negative", "maintenance", "neutral", "correction"];
