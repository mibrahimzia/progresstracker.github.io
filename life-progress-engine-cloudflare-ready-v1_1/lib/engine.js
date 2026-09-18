import { DIMENSIONS, DIMENSION_KEYS, ENGINE_CONFIG } from "./config.js";

const clamp01 = (x) => Math.max(0, Math.min(1, x));

/**
 * Compute the credit (delta to apply to a dimension state) for one structured
 * event. Positive events increase state, negative events decrease it,
 * maintenance events only offset decay (handled in applyDecay, not here),
 * neutral/correction events produce zero credit by default.
 *
 * event = {
 *   dimension, type,            // one of DIMENSION_KEYS / EVENT_TYPES
 *   magnitude,                  // 0..1 — how big was this
 *   quality, evidence, significance, persistence, alignment, // 0..1 each
 * }
 */
export function computeEventCredit(event, currentDimensionState) {
  const w = ENGINE_CONFIG.QUALITY_WEIGHTS;
  const qualityFactor =
    w.quality * (event.quality ?? 0.5) +
    w.evidence * (event.evidence ?? 0.5) +
    w.significance * (event.significance ?? 0.5) +
    w.persistence * (event.persistence ?? 0.5) +
    w.alignment * (event.alignment ?? 0.5);

  const magnitude = clamp01(event.magnitude ?? 0.5);
  const diminishing = Math.pow(1 - clamp01(currentDimensionState), ENGINE_CONFIG.DIMINISHING_EXPONENT);

  let credit = ENGINE_CONFIG.EVENT_SCALE * magnitude * qualityFactor * diminishing;

  if (event.type === "negative") {
    credit = -credit * ENGINE_CONFIG.NEGATIVE_EVENT_MULTIPLIER;
  } else if (event.type === "neutral" || event.type === "correction") {
    credit = 0;
  } else if (event.type === "maintenance") {
    credit = 0; // maintenance offsets decay elsewhere, it doesn't grow the state
  }
  // "positive" falls through as computed above

  return credit;
}

/** Apply one event to a dimension-state map, returning { newStates, credit }. */
export function applyEvent(dimensionStates, event) {
  const key = event.dimension;
  if (!DIMENSION_KEYS.includes(key)) {
    throw new Error(`Unknown dimension: ${key}`);
  }
  const current = dimensionStates[key] ?? 0;
  const credit = computeEventCredit(event, current);
  const next = clamp01(current + credit);
  return { newStates: { ...dimensionStates, [key]: next }, credit };
}

/**
 * Apply decay for `daysElapsed` days to every dimension. `maintenanceByDim`
 * is an optional { dimKey: 0..1 } map of how much maintenance activity
 * offset decay for that dimension over the period (0 = none, 1 = fully offset).
 */
export function applyDecay(dimensionStates, daysElapsed, maintenanceByDim = {}) {
  if (daysElapsed <= 0) return dimensionStates;
  const next = { ...dimensionStates };
  for (const dim of DIMENSIONS) {
    const x = next[dim.key] ?? 0;
    const factor = ENGINE_CONFIG.DIMENSION_DECAY_FACTOR[dim.key] ?? 1.0;
    const maintenance = clamp01(maintenanceByDim[dim.key] ?? 0);
    const perDayDecay =
      ENGINE_CONFIG.BASE_DECAY *
      factor *
      (ENGINE_CONFIG.DECAY_STATE_FLOOR + ENGINE_CONFIG.DECAY_STATE_SCALE * x) *
      (1 - maintenance);
    next[dim.key] = clamp01(x - perDayDecay * daysElapsed);
  }
  return next;
}

/** Weighted arithmetic + geometric blend with a foundation modifier. */
export function computeTrajectory(dimensionStates) {
  let arithmetic = 0;
  let logGeometric = 0;
  for (const dim of DIMENSIONS) {
    const x = clamp01(dimensionStates[dim.key] ?? 0);
    arithmetic += dim.weight * x;
    // avoid log(0); a dimension truly at 0 should drag geometric mean hard but not to -Infinity
    logGeometric += dim.weight * Math.log(Math.max(x, 0.01));
  }
  const geometric = Math.exp(logGeometric);
  const combined =
    ENGINE_CONFIG.AGG_ARITHMETIC_WEIGHT * arithmetic + ENGINE_CONFIG.AGG_GEOMETRIC_WEIGHT * geometric;

  const execution = clamp01(dimensionStates.execution ?? 0);
  const sustainability = clamp01(dimensionStates.sustainability ?? 0);
  const foundation =
    ENGINE_CONFIG.FOUNDATION_MODIFIER_BASE +
    ENGINE_CONFIG.FOUNDATION_MODIFIER_SCALE * Math.sqrt(execution * sustainability);

  return clamp01(combined * foundation);
}

/**
 * Slow-moving threshold: chases a lagging moving average of trajectory,
 * offset by a margin, and never jumps to match a single day's spike.
 * `recentTrajectories` should be the last THRESHOLD_LOOKBACK_DAYS values
 * (oldest first), not including today's.
 */
export function updateThreshold(prevThreshold, recentTrajectories, daysElapsed = 1) {
  if (!recentTrajectories || recentTrajectories.length === 0) {
    return clamp01(prevThreshold ?? ENGINE_CONFIG.THRESHOLD_INITIAL);
  }
  const avg = recentTrajectories.reduce((a, b) => a + b, 0) / recentTrajectories.length;
  const target = avg - ENGINE_CONFIG.THRESHOLD_MARGIN;
  const gap = target - prevThreshold;
  const next = prevThreshold + gap * ENGINE_CONFIG.THRESHOLD_ADAPT_RATE * daysElapsed;
  return Math.max(ENGINE_CONFIG.THRESHOLD_MIN, Math.min(ENGINE_CONFIG.THRESHOLD_MAX, next));
}

export function emptyDimensionStates(initial = 0.35) {
  const states = {};
  for (const dim of DIMENSIONS) states[dim.key] = initial;
  return states;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z").getTime();
  const b = new Date(isoB + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
