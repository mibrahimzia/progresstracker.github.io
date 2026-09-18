export async function onRequestPost({ request, env }) {
  let backup;
  try {
    backup = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  if (!backup || !Array.isArray(backup.entries) || !Array.isArray(backup.events)) {
    return json({ error: "does not look like a Life Progress Engine backup" }, 400);
  }
  if (backup.confirm !== true) {
    return json({ error: "this will replace ALL current data — resend with confirm: true" }, 400);
  }

  const db = env.DB;

  // Wipe existing data.
  await db.batch([
    db.prepare("DELETE FROM events"),
    db.prepare("DELETE FROM entries"),
    db.prepare("DELETE FROM dimension_state"),
    db.prepare("DELETE FROM trajectory_history"),
    db.prepare("DELETE FROM trajectory_points"),
    db.prepare("DELETE FROM meta"),
  ]);

  const stmts = [];

  for (const e of backup.entries) {
    stmts.push(
      db
        .prepare("INSERT INTO entries (id, created_at, raw_text, source) VALUES (?, ?, ?, ?)")
        .bind(e.id, e.created_at, e.raw_text, e.source)
    );
  }
  for (const ev of backup.events) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO events (id, entry_id, created_at, dimension, event_type, magnitude, quality, evidence,
           significance, persistence, alignment, confidence, explanation, credit, status, corrected_from)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ev.id,
          ev.entry_id,
          ev.created_at,
          ev.dimension,
          ev.event_type,
          ev.magnitude,
          ev.quality,
          ev.evidence,
          ev.significance,
          ev.persistence,
          ev.alignment,
          ev.confidence,
          ev.explanation,
          ev.credit,
          ev.status,
          ev.corrected_from
        )
    );
  }
  for (const d of backup.dimension_state || []) {
    stmts.push(
      db
        .prepare("INSERT INTO dimension_state (dimension, value, updated_at) VALUES (?, ?, ?)")
        .bind(d.dimension, d.value, d.updated_at)
    );
  }
  for (const t of backup.trajectory_history || []) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO trajectory_history (date, trajectory, threshold, dimension_snapshot, note) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(t.date, t.trajectory, t.threshold, t.dimension_snapshot, t.note)
    );
  }
  for (const p of backup.trajectory_points || []) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO trajectory_points (id, recorded_at, trajectory, threshold, entry_id, note) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(p.id, p.recorded_at, p.trajectory, p.threshold, p.entry_id ?? null, p.note ?? null)
    );
  }
  for (const m of backup.meta || []) {
    stmts.push(db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").bind(m.key, m.value));
  }

  // D1 batch has a practical size limit — chunk it defensively.
  const chunkSize = 50;
  for (let i = 0; i < stmts.length; i += chunkSize) {
    await db.batch(stmts.slice(i, i + chunkSize));
  }

  return json({ ok: true, restored: { entries: backup.entries.length, events: backup.events.length } }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
