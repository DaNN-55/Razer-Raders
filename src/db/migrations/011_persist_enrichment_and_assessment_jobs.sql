ALTER TABLE radar_candidates
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT '待补证',
  ADD COLUMN IF NOT EXISTS assessment_result JSONB,
  ADD COLUMN IF NOT EXISTS assessment_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS assessment_task_id TEXT;

ALTER TABLE radar_candidates
  ADD CONSTRAINT radar_candidates_lifecycle_status_check
  CHECK (lifecycle_status IN ('待补证', '补证中', '评估中', '评估失败待重试', '评估延迟', '证据不足未入选', '已评估未入选', '已评估待发布'));

UPDATE radar_candidates
SET lifecycle_status = '待补证'
WHERE evaluation_status = 'evaluating';

ALTER TABLE radar_candidates
  DROP CONSTRAINT IF EXISTS radar_candidates_evaluation_status_check;

ALTER TABLE radar_candidates
  ADD CONSTRAINT radar_candidates_evaluation_status_check
  CHECK (evaluation_status IN ('evaluating', 'queued', 'assessment-delayed', 'not-selected', 'ready', 'published'));


CREATE TABLE IF NOT EXISTS candidate_tasks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES radar_candidates(id) ON DELETE CASCADE,
  task_kind TEXT NOT NULL CHECK (task_kind IN ('enrichment', 'assessment')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'leased', 'completed', 'retryable', 'delayed')),
  evidence_fingerprint TEXT NOT NULL,
  configuration_version TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (candidate_id, task_kind, evidence_fingerprint, configuration_version)
);

CREATE INDEX IF NOT EXISTS candidate_tasks_claim_idx
  ON candidate_tasks (task_kind, status, lease_expires_at, created_at);

INSERT INTO candidate_tasks (id, candidate_id, task_kind, status, evidence_fingerprint, configuration_version, runtime_id)
SELECT 'legacy-enrichment:' || candidate.id, candidate.id, 'enrichment', 'queued', 'legacy:' || md5(candidate.id), 'legacy', 'legacy'
FROM radar_candidates candidate
WHERE candidate.evaluation_status = 'evaluating'
ON CONFLICT (candidate_id, task_kind, evidence_fingerprint, configuration_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS candidate_task_evidence_digests (
  task_id TEXT NOT NULL REFERENCES candidate_tasks(id) ON DELETE CASCADE,
  digest_id BIGINT NOT NULL REFERENCES evidence_digests(id) ON DELETE RESTRICT,
  PRIMARY KEY (task_id, digest_id)
);
