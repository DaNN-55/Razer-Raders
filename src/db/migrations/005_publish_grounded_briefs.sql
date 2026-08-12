ALTER TABLE radar_candidates
  DROP CONSTRAINT IF EXISTS radar_candidates_evaluation_status_check;

ALTER TABLE radar_candidates
  ADD CONSTRAINT radar_candidates_evaluation_status_check
  CHECK (evaluation_status IN ('evaluating', 'published'));

ALTER TABLE radar_signals
  ADD COLUMN IF NOT EXISTS candidate_id TEXT REFERENCES radar_candidates(id),
  ADD COLUMN IF NOT EXISTS section_citations JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS radar_signals_candidate_id_idx
  ON radar_signals (candidate_id);
