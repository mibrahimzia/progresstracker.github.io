import { DIMENSIONS } from "../../lib/config.js";
import { computeTrajectory } from "../../lib/engine.js";
import { catchUpToToday, ensureTrajectoryPoints } from "../../lib/store.js";

export async function onRequestGet({ env }) {
  const db = env.DB;
  const { states, threshold } = await catchUpToToday(db);
  const trajectory = computeTrajectory(states);
  await ensureTrajectoryPoints(db);

  const { results: history } = await db
    .prepare("SELECT date, trajectory, threshold FROM trajectory_history ORDER BY date ASC")
    .all();

  const { results: points } = await db
    .prepare(`SELECT tp.id, tp.recorded_at, tp.trajectory, tp.threshold, tp.entry_id, tp.note,
       COALESCE((SELECT SUM(e.credit) FROM events e WHERE e.entry_id = tp.entry_id AND e.status = 'active'), 0) AS event_impact
       FROM trajectory_points tp ORDER BY tp.recorded_at ASC`)
    .all();

  let changePct = null;
  if (history && history.length > 1) {
    const monthAgoIdx = Math.max(0, history.length - 31);
    const past = Number(history[monthAgoIdx].trajectory);
    if (past > 0) changePct = ((trajectory - past) / past) * 100;
  }

  return new Response(
    JSON.stringify({
      trajectory,
      threshold,
      changePct,
      dimensions: DIMENSIONS.map((d) => ({ key: d.key, name: d.name, weight: d.weight, value: states[d.key] ?? 0 })),
      history: history || [],
      points: points || [],
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
