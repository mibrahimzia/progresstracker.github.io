-- Life Progress Engine — D1 schema (single-user)

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,        -- ISO timestamp
  raw_text TEXT NOT NULL,
  source TEXT NOT NULL             -- 'llm' | 'manual'
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER REFERENCES entries(id),
  created_at TEXT NOT NULL,
  dimension TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- positive|negative|maintenance|neutral|correction
  magnitude REAL,
  quality REAL,
  evidence REAL,
  significance REAL,
  persistence REAL,
  alignment REAL,
  confidence REAL,
  explanation TEXT,
  credit REAL,                     -- computed delta applied to the dimension
  status TEXT NOT NULL DEFAULT 'active',  -- active | superseded
  corrected_from INTEGER REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS dimension_state (
  dimension TEXT PRIMARY KEY,
  value REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trajectory_history (
  date TEXT PRIMARY KEY,           -- YYYY-MM-DD, one row per day
  trajectory REAL NOT NULL,
  threshold REAL NOT NULL,
  dimension_snapshot TEXT NOT NULL, -- JSON: { dim: value, ... }
  note TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Intraday trajectory points for the interactive chart. Daily history remains
-- the canonical long-term series; points preserve within-day movement.
CREATE TABLE IF NOT EXISTS trajectory_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT NOT NULL,
  trajectory REAL NOT NULL,
  threshold REAL NOT NULL,
  entry_id INTEGER REFERENCES entries(id),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_trajectory_points_recorded ON trajectory_points(recorded_at);

CREATE INDEX IF NOT EXISTS idx_events_entry ON events(entry_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
