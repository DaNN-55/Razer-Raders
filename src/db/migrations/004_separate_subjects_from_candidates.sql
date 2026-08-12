ALTER TABLE radar_candidates
  ADD COLUMN IF NOT EXISTS subject_canonical_identifier TEXT;

UPDATE radar_candidates
SET subject_canonical_identifier = canonical_identifier
WHERE subject_canonical_identifier IS NULL;

ALTER TABLE radar_candidates
  ALTER COLUMN subject_canonical_identifier SET NOT NULL;

CREATE INDEX IF NOT EXISTS radar_candidates_subject_id_idx
  ON radar_candidates (subject_id, last_collected_at DESC);
