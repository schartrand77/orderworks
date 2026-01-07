-- Track when a job was first viewed in OrderWorks.

ALTER TABLE "jobs"
ADD COLUMN IF NOT EXISTS "viewed_at" TIMESTAMP(3);
