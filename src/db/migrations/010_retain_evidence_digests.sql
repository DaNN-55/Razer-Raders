CREATE TABLE IF NOT EXISTS evidence_digests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_identifier TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  content_fingerprint TEXT NOT NULL,
  excerpts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_identifier, source_kind, source_url, content_fingerprint)
);

CREATE TABLE IF NOT EXISTS candidate_evidence_digests (
  candidate_id TEXT NOT NULL REFERENCES radar_candidates(id) ON DELETE CASCADE,
  digest_id BIGINT NOT NULL REFERENCES evidence_digests(id) ON DELETE CASCADE,
  PRIMARY KEY (candidate_id, digest_id)
);

CREATE INDEX IF NOT EXISTS evidence_digests_lookup_idx
  ON evidence_digests (canonical_identifier, source_kind, source_url, content_fingerprint);
