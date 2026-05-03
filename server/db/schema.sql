-- LexMatch AI - SQLite Schema v3
-- Replaces PostgreSQL schema. Run via: node scripts/migrate.mjs

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Judges ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  court_level TEXT NOT NULL,
  category TEXT NOT NULL,
  years_of_experience INTEGER NOT NULL DEFAULT 0,
  case_load_capacity INTEGER NOT NULL DEFAULT 50,
  current_case_load INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL DEFAULT 'Available',
  district TEXT,
  state TEXT,
  area TEXT,
  court_name TEXT,
  specializations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Hearings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  case_title TEXT NOT NULL,
  assigned_judge_id TEXT,
  assigned_judge_name TEXT NOT NULL,
  hearing_date TEXT NOT NULL,
  hearing_time TEXT NOT NULL DEFAULT '10:00',
  court_room TEXT,
  state TEXT,
  district TEXT,
  local_court_name TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Activity History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_history (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL DEFAULT (datetime('now')),
  results INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Managed Cases ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS managed_cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  assigned_judge TEXT NOT NULL DEFAULT 'Unassigned',
  uploaded_by TEXT NOT NULL,
  upload_name TEXT,
  notes TEXT NOT NULL DEFAULT '',
  auto_assigned INTEGER NOT NULL DEFAULT 0,
  assignment_reason TEXT,
  priority_score REAL,
  priority_band TEXT,
  bail_risk_score REAL,
  escape_risk_score REAL,
  risk_score REAL,
  public_defender_status TEXT DEFAULT 'Not Required',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Priority Overrides ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS priority_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  original_band TEXT,
  override_band TEXT NOT NULL,
  original_score REAL,
  override_score REAL,
  reason TEXT NOT NULL,
  overridden_by TEXT NOT NULL DEFAULT 'staff',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_judges_availability ON judges(availability);
CREATE INDEX IF NOT EXISTS idx_judges_category ON judges(category);
CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings(hearing_date ASC);
CREATE INDEX IF NOT EXISTS idx_hearings_judge ON hearings(assigned_judge_id);
CREATE INDEX IF NOT EXISTS idx_history_event_date ON activity_history(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_managed_cases_status ON managed_cases(status);
CREATE INDEX IF NOT EXISTS idx_managed_cases_band ON managed_cases(priority_band);
CREATE INDEX IF NOT EXISTS idx_priority_overrides_case ON priority_overrides(case_id);
