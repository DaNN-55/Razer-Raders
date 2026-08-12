CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS connector_health (
  connector_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  caption TEXT NOT NULL,
  status TEXT NOT NULL,
  tone TEXT NOT NULL,
  last_success_at TIMESTAMPTZ,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS brief_snapshots (
  id TEXT PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('published', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS radar_signals (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES brief_snapshots(id) ON DELETE CASCADE,
  display_index INTEGER NOT NULL,
  state TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics JSONB NOT NULL,
  sources JSONB NOT NULL,
  builder_value TEXT NOT NULL,
  product_opportunity TEXT NOT NULL,
  happened TEXT NOT NULL,
  why_now TEXT NOT NULL,
  technical_basis TEXT NOT NULL,
  risk TEXT NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS radar_signals_brief_id_display_index_idx
  ON radar_signals (brief_id, display_index);

CREATE TABLE IF NOT EXISTS source_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_identifier TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  trust TEXT NOT NULL CHECK (trust = 'untrusted'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_identifier, connector_id, source_url)
);

CREATE INDEX IF NOT EXISTS source_evidence_collected_at_idx
  ON source_evidence (collected_at DESC);

CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

INSERT INTO connector_health (connector_id, name, caption, status, tone)
VALUES
  ('github-trending', 'GitHub Trending', '公开趋势页 + 仓库补证', '等待首次采集', 'muted'),
  ('hugging-face-trending', 'Hugging Face', '模型与 Spaces 热度', '未启用', 'muted'),
  ('show-hn', 'Show HN', '开发者首次展示', '未启用', 'muted'),
  ('official-watchlist', 'Official Release', '已登记官方 Watchlist', '未启用', 'muted')
ON CONFLICT (connector_id) DO NOTHING;
