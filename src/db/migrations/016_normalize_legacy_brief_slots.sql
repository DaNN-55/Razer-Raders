DROP INDEX IF EXISTS brief_snapshots_published_day_slot_idx;

WITH ranked_snapshots AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY publication_day ORDER BY published_at, id) AS slot_rank
  FROM brief_snapshots
  WHERE status = 'published'
)
UPDATE brief_snapshots snapshot
SET publication_slot = CASE WHEN ranked.slot_rank = 1 THEN 'morning' ELSE 'afternoon' END
FROM ranked_snapshots ranked
WHERE snapshot.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS brief_snapshots_published_day_slot_idx
  ON brief_snapshots (publication_day, publication_slot)
  WHERE status = 'published';
