-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "queue_position" INTEGER NOT NULL DEFAULT 0;

-- Backfill sequential queue positions based on creation date
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY makerworks_created_at ASC, "createdAt" ASC, id ASC) as row_number
  FROM "jobs"
)
UPDATE "jobs" j
SET queue_position = ordered.row_number
FROM ordered
WHERE j.id = ordered.id;

CREATE INDEX "jobs_queue_position_idx" ON "jobs"("queue_position");
