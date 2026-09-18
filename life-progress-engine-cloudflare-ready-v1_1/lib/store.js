import { DIMENSIONS, ENGINE_CONFIG } from "./config.js";
import {
  applyDecay,
  computeTrajectory,
  updateThreshold,
  emptyDimensionStates,
  daysBetween,
  todayISO,
} from "./engine.js";

export async function getMeta(db, key) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}

export async function setMeta(db, key, value) {
  await db
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

export async function getDimensionStates(db) {
  const { results } = await db.prepare("SELECT dimension, value FROM dimension_state").all();
  if (!results || results.length === 0) return null;
  const states = {};
  for (const row of results) states[row.dimension] = row.value;
  return states;
}

export async function saveDimensionStates(db, states, updatedAt) {
  const stmts = DIMENSIONS.map((dim) =>
    db
      .prepare(
        "INSERT INTO dimension_state (dimension, value, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(dimension) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(dim.key, states[dim.key] ?? 0, updatedAt)
  );
  await db.batch(stmts);
}

export async function getRecentTrajectories(db, limit) {
  const { results } = await db
    .prepare("SELECT trajectory FROM trajectory_history ORDER BY date DESC LIMIT ?")
    .bind(limit)
    .all();
  return (results || []).map((r) => r.trajectory).reverse();
}

export async function upsertTrajectoryHistory(db, date, trajectory, threshold, dimensionStates, note) {
  await db
    .prepare(
      "INSERT INTO trajectory_history (date, trajectory, threshold, dimension_snapshot, note) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(date) DO UPDATE SET trajectory = excluded.trajectory, threshold = excluded.threshold, " +
        "dimension_snapshot = excluded.dimension_snapshot, note = excluded.note"
    )
    .bind(date, trajectory, threshold, JSON.stringify(dimensionStates), note || null)
    .run();
}

export async function appendTrajectoryPoint(db, trajectory, threshold, entryId = null, note = null, recordedAt = new Date().toISOString()) {
  await db
    .prepare(
      "INSERT INTO trajectory_points (recorded_at, trajectory, threshold, entry_id, note) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(recordedAt, trajectory, threshold, entryId, note || null)
    .run();
}

export async function ensureTrajectoryPoints(db) {
  // Older databases may predate trajectory_points. The schema migration creates
  // it, and this backfill gives the chart a sensible starting point from the
  // existing daily history without inventing extra data.
  const countRow = await db.prepare("SELECT COUNT(*) AS count FROM trajectory_points").first();
  if (Number(countRow?.count || 0) > 0) return;
  const { results } = await db.prepare(
    "SELECT date, trajectory, threshold, note FROM trajectory_history ORDER BY date ASC"
  ).all();
  if (!results?.length) return;
  const stmts = results.map((r) =>
    db.prepare(
      "INSERT INTO trajectory_points (recorded_at, trajectory, threshold, entry_id, note) VALUES (?, ?, ?, NULL, ?)"
    ).bind(`${r.date}T12:00:00.000Z`, r.trajectory, r.threshold, r.note || null)
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

/**
 * Ensures dimension_state exists and decay has been applied for every day
 * since the last update, up to (but not including) today. Call this before
 * applying any new event. Returns { states, threshold, lastDate }.
 */
export async function catchUpToToday(db) {
  let states = await getDimensionStates(db);
  let lastDate = await getMeta(db, "last_update_date");
  let threshold = parseFloat((await getMeta(db, "threshold")) ?? ENGINE_CONFIG.THRESHOLD_INITIAL);

  const today = todayISO();

  if (!states) {
    states = emptyDimensionStates();
    lastDate = today;
    await saveDimensionStates(db, states, new Date().toISOString());
    await setMeta(db, "last_update_date", today);
    await setMeta(db, "threshold", String(threshold));
    const trajectory = computeTrajectory(states);
    await upsertTrajectoryHistory(db, today, trajectory, threshold, states, "initialized");
    await appendTrajectoryPoint(db, trajectory, threshold, null, "Initialized baseline");
    return { states, threshold, lastDate: today };
  }

  const elapsed = daysBetween(lastDate, today);
  if (elapsed > 0) {
    states = applyDecay(states, elapsed);
    const recent = await getRecentTrajectories(db, ENGINE_CONFIG.THRESHOLD_LOOKBACK_DAYS);
    threshold = updateThreshold(threshold, recent, elapsed);
    await saveDimensionStates(db, states, new Date().toISOString());
    await setMeta(db, "last_update_date", today);
    await setMeta(db, "threshold", String(threshold));
    const trajectory = computeTrajectory(states);
    await upsertTrajectoryHistory(db, today, trajectory, threshold, states, "decay");
    lastDate = today;
  }

  return { states, threshold, lastDate };
}

/** Persist a new set of dimension states after applying event(s) today, and refresh today's history row. */
export async function commitStates(db, states, threshold, entryId = null, note = null) {
  const today = todayISO();
  await saveDimensionStates(db, states, new Date().toISOString());
  await setMeta(db, "threshold", String(threshold));
  const trajectory = computeTrajectory(states);
  await upsertTrajectoryHistory(db, today, trajectory, threshold, states, null);
  await appendTrajectoryPoint(db, trajectory, threshold, entryId, note);
  return trajectory;
}
