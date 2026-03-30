-- LexMatch AI PostgreSQL schema
-- Creates normalized tables for cases, tags, and metadata.

BEGIN;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  court TEXT NOT NULL,
  jurisdiction TEXT,
  decision_date DATE,
  year INTEGER,
  citation TEXT,
  case_type TEXT,
  summary TEXT,
  full_text TEXT,
  source_url TEXT,
  source_name TEXT,
  similarity NUMERIC(5,2),
  priority_score NUMERIC(5,2),
  priority_band VARCHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_tags (
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (case_id, tag_id)
);

CREATE TABLE IF NOT EXISTS case_metadata (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingest_batch TEXT,
  source_checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS judges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  court_level TEXT NOT NULL,
  category TEXT NOT NULL,
  years_of_experience INTEGER NOT NULL DEFAULT 0,
  case_load_capacity INTEGER NOT NULL DEFAULT 0,
  current_case_load INTEGER NOT NULL DEFAULT 0,
  availability TEXT NOT NULL DEFAULT 'Available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hearings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  case_title TEXT NOT NULL,
  assigned_judge_id TEXT,
  assigned_judge_name TEXT NOT NULL,
  hearing_date DATE NOT NULL,
  hearing_time TEXT NOT NULL,
  court_room TEXT,
  state TEXT,
  district TEXT,
  local_court_name TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_history (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  results INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core query indexes
CREATE INDEX IF NOT EXISTS idx_cases_court ON cases(court);
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_decision_date ON cases(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_cases_priority_score ON cases(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_cases_priority_band ON cases(priority_band);
CREATE INDEX IF NOT EXISTS idx_cases_year ON cases(year DESC);
CREATE INDEX IF NOT EXISTS idx_judges_availability ON judges(availability);
CREATE INDEX IF NOT EXISTS idx_judges_category ON judges(category);
CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings(hearing_date ASC);
CREATE INDEX IF NOT EXISTS idx_hearings_judge ON hearings(assigned_judge_id);
CREATE INDEX IF NOT EXISTS idx_history_event_date ON activity_history(event_date DESC);

-- Text search index for title/summary/full_text
CREATE INDEX IF NOT EXISTS idx_cases_fts
  ON cases
  USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(full_text, ''))
  );

-- JSON metadata search index
CREATE INDEX IF NOT EXISTS idx_case_metadata_jsonb ON case_metadata USING GIN(metadata);

-- Trigger to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
  
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cases_updated_at ON cases;
CREATE TRIGGER trg_cases_updated_at
BEFORE UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_case_metadata_updated_at ON case_metadata;
CREATE TRIGGER trg_case_metadata_updated_at
BEFORE UPDATE ON case_metadata
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_judges_updated_at ON judges;
CREATE TRIGGER trg_judges_updated_at
BEFORE UPDATE ON judges
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hearings_updated_at ON hearings;
CREATE TRIGGER trg_hearings_updated_at
BEFORE UPDATE ON hearings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
