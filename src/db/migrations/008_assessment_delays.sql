ALTER TABLE radar_candidates
  ADD COLUMN IF NOT EXISTS assessment_delay_detail TEXT;

ALTER TABLE radar_candidates
  DROP CONSTRAINT IF EXISTS radar_candidates_evaluation_status_check;

ALTER TABLE radar_candidates
  ADD CONSTRAINT radar_candidates_evaluation_status_check
  CHECK (evaluation_status IN ('evaluating', 'assessment-delayed', 'published'));

CREATE INDEX IF NOT EXISTS radar_candidates_assessment_delay_idx
  ON radar_candidates (evaluation_status, last_collected_at DESC)
  WHERE evaluation_status = 'assessment-delayed';
