ALTER TABLE brief_snapshots
  ADD COLUMN IF NOT EXISTS publication_slot TEXT NOT NULL DEFAULT 'morning';

UPDATE brief_snapshots
SET publication_slot = 'morning';

ALTER TABLE brief_snapshots
  DROP CONSTRAINT IF EXISTS brief_snapshots_publication_slot_check;

ALTER TABLE brief_snapshots
  ADD CONSTRAINT brief_snapshots_publication_slot_check
  CHECK (publication_slot IN ('morning', 'afternoon'));

DROP INDEX IF EXISTS brief_snapshots_published_day_idx;

CREATE UNIQUE INDEX IF NOT EXISTS brief_snapshots_published_day_slot_idx
  ON brief_snapshots (publication_day, publication_slot)
  WHERE status = 'published';
