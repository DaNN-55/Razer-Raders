CREATE TABLE IF NOT EXISTS radar_profile_versions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE CHECK (version > 0),
  configuration JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS radar_profile_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  active_profile_id TEXT NOT NULL REFERENCES radar_profile_versions(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radar_profile_versions_created_at_idx
  ON radar_profile_versions (created_at DESC);
