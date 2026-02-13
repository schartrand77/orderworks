-- Track receipt sends for jobs
ALTER TABLE "jobs"
ADD COLUMN "receipt_sent_at" TIMESTAMP(3),
ADD COLUMN "receipt_send_count" INTEGER NOT NULL DEFAULT 0;
