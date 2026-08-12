ALTER TABLE source_evidence
  ADD COLUMN IF NOT EXISTS source_title TEXT;

UPDATE source_evidence
SET source_title = canonical_identifier
WHERE source_title IS NULL;

ALTER TABLE source_evidence
  ALTER COLUMN source_title SET NOT NULL;
