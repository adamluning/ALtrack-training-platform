ALTER TABLE goals ADD COLUMN completed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE goals
SET completed = TRUE
WHERE status = 'completed';

ALTER TABLE goals DROP COLUMN status;
