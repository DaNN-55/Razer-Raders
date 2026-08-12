ALTER TABLE brief_snapshots
  ADD COLUMN IF NOT EXISTS publication_day DATE,
  ADD COLUMN IF NOT EXISTS configuration_version TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS ranking_policy_version TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS model_runtime_id TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT NOT NULL DEFAULT 'unknown';

UPDATE brief_snapshots
SET publication_day = (published_at AT TIME ZONE 'Asia/Shanghai')::date
WHERE publication_day IS NULL;

ALTER TABLE brief_snapshots
  ALTER COLUMN publication_day SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brief_snapshots_published_day_idx
  ON brief_snapshots (publication_day)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publication_day DATE NOT NULL,
  collection_run_id TEXT REFERENCES collection_runs(id),
  stage TEXT NOT NULL CHECK (stage IN ('collection', 'assessment', 'validation', 'publication')),
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  detail TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS pipeline_runs_publication_day_idx
  ON pipeline_runs (publication_day, started_at DESC);
