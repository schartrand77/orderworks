-- Drop webhook event tracking tables from the OrderWorks schema and add makerworks_updated_at metadata.

ALTER TABLE "jobs"
ADD COLUMN IF NOT EXISTS "makerworks_updated_at" TIMESTAMP(3);

UPDATE "jobs"
SET "makerworks_updated_at" = COALESCE("makerworks_updated_at", "makerworks_created_at");

ALTER TABLE "jobs"
ALTER COLUMN "makerworks_updated_at" SET NOT NULL;

DROP TABLE IF EXISTS "makerworks_webhook_events";
DROP TYPE IF EXISTS "WebhookEventStatus";
