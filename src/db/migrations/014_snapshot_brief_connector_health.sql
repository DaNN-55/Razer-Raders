CREATE TABLE IF NOT EXISTS brief_connector_health (
  brief_id TEXT NOT NULL REFERENCES brief_snapshots(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  tone TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  PRIMARY KEY (brief_id, connector_id)
);
