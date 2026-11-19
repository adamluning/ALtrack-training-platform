ALTER TABLE goals
    ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'closed'));

UPDATE goals
SET status = 'completed'
WHERE completed = TRUE;

ALTER TABLE goals DROP COLUMN completed;
