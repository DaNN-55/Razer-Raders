CREATE TABLE IF NOT EXISTS radar_subjects (
  id TEXT PRIMARY KEY,
  canonical_identifier TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS radar_candidates (
  id TEXT PRIMARY KEY,
  canonical_identifier TEXT NOT NULL UNIQUE,
  connector_id TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES radar_subjects(id),
  signal_type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  first_collected_at TIMESTAMPTZ NOT NULL,
  last_collected_at TIMESTAMPTZ NOT NULL,
  evaluation_status TEXT NOT NULL CHECK (evaluation_status IN ('evaluating')),
  signal_state TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radar_candidates_evaluation_window_idx
  ON radar_candidates (evaluation_status, last_collected_at DESC);

ALTER TABLE source_evidence
  ADD COLUMN IF NOT EXISTS candidate_id TEXT REFERENCES radar_candidates(id);

CREATE INDEX IF NOT EXISTS source_evidence_candidate_id_idx
  ON source_evidence (candidate_id);
