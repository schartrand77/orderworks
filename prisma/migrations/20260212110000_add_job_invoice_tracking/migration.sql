-- Track invoice sends for jobs
ALTER TABLE "jobs"
ADD COLUMN "invoice_sent_at" TIMESTAMP(3),
ADD COLUMN "invoice_send_count" INTEGER NOT NULL DEFAULT 0;
