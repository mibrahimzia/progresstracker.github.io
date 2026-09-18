export async function onRequestGet({ env }) {
  const db = env.DB;
  const [entries, events, dimensionState, trajectoryHistory, trajectoryPoints, meta] = await Promise.all([
    db.prepare("SELECT * FROM entries ORDER BY id ASC").all(),
    db.prepare("SELECT * FROM events ORDER BY id ASC").all(),
    db.prepare("SELECT * FROM dimension_state").all(),
    db.prepare("SELECT * FROM trajectory_history ORDER BY date ASC").all(),
    db.prepare("SELECT * FROM trajectory_points ORDER BY recorded_at ASC").all(),
    db.prepare("SELECT * FROM meta").all(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 2,
    entries: entries.results || [],
    events: events.results || [],
    dimension_state: dimensionState.results || [],
    trajectory_history: trajectoryHistory.results || [],
    trajectory_points: trajectoryPoints.results || [],
    meta: meta.results || [],
  };

  return new Response(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="life-progress-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
