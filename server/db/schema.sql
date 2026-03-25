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

-- Core query indexes
CREATE INDEX IF NOT EXISTS idx_cases_court ON cases(court);
CREATE INDEX IF NOT EXISTS idx_cases_case_type ON cases(case_type);
CREATE INDEX IF NOT EXISTS idx_cases_decision_date ON cases(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_cases_priority_score ON cases(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_cases_priority_band ON cases(priority_band);
CREATE INDEX IF NOT EXISTS idx_cases_year ON cases(year DESC);

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

COMMIT;
