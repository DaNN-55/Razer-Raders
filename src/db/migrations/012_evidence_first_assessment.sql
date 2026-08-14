ALTER TABLE radar_signals
  ADD COLUMN IF NOT EXISTS why_in_brief TEXT NOT NULL DEFAULT '';

UPDATE brief_snapshots
SET pipeline_version = 'legacy-assessment@v1'
WHERE pipeline_version IN ('unknown', 'assessment-pipeline@v1');
