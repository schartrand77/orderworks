-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'processed', 'failed');

-- CreateTable
CREATE TABLE "makerworks_webhook_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "payment_intent_id" TEXT,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "makerworks_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "makerworks_webhook_events_job_id_idx" ON "makerworks_webhook_events"("job_id");
CREATE INDEX "makerworks_webhook_events_status_idx" ON "makerworks_webhook_events"("status");

-- AddForeignKey
ALTER TABLE "makerworks_webhook_events"
ADD CONSTRAINT "makerworks_webhook_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
