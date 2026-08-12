ALTER TABLE radar_candidates
  ADD COLUMN IF NOT EXISTS observation_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT '值得关注',
  ADD COLUMN IF NOT EXISTS ranking_score INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ranking_policy_version TEXT NOT NULL DEFAULT 'v0.1';

CREATE INDEX IF NOT EXISTS radar_candidates_evaluation_rank_idx
  ON radar_candidates (evaluation_status, ranking_score DESC, last_collected_at DESC);

CREATE TABLE IF NOT EXISTS candidate_source_evidence (
  candidate_id TEXT NOT NULL REFERENCES radar_candidates(id) ON DELETE CASCADE,
  evidence_id BIGINT NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
  association TEXT NOT NULL CHECK (association IN ('primary', 'related')),
  PRIMARY KEY (candidate_id, evidence_id)
);

INSERT INTO candidate_source_evidence (candidate_id, evidence_id, association)
SELECT source_evidence.candidate_id, source_evidence.id,
  CASE WHEN source_evidence.canonical_identifier = radar_candidates.canonical_identifier THEN 'primary' ELSE 'related' END
FROM source_evidence
JOIN radar_candidates ON radar_candidates.id = source_evidence.candidate_id
WHERE source_evidence.candidate_id IS NOT NULL
ON CONFLICT (candidate_id, evidence_id) DO NOTHING;
