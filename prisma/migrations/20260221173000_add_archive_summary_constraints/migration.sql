CREATE TABLE IF NOT EXISTS orderworks."archived_jobs" (
  "id" TEXT PRIMARY KEY,
  "payment_intent_id" TEXT NOT NULL UNIQUE,
  "total_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "line_items" JSONB NOT NULL,
  "shipping" JSONB,
  "metadata" JSONB,
  "user_id" TEXT,
  "customer_email" TEXT,
  "makerworks_created_at" TIMESTAMP(3) NOT NULL,
  "makerworks_updated_at" TIMESTAMP(3) NOT NULL,
  "status" "JobStatus" NOT NULL,
  "notes" TEXT,
  "payment_method" TEXT,
  "payment_status" TEXT,
  "receipt_sent_at" TIMESTAMP(3),
  "receipt_send_count" INTEGER NOT NULL DEFAULT 0,
  "invoice_sent_at" TIMESTAMP(3),
  "invoice_send_count" INTEGER NOT NULL DEFAULT 0,
  "fulfillment_status" "FulfillmentStatus" NOT NULL,
  "fulfilled_at" TIMESTAMP(3),
  "queue_position" INTEGER NOT NULL,
  "viewed_at" TIMESTAMP(3),
  "original_created_at" TIMESTAMP(3) NOT NULL,
  "original_updated_at" TIMESTAMP(3) NOT NULL,
  "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "archived_jobs_archived_at_idx" ON orderworks."archived_jobs" ("archived_at");
CREATE INDEX IF NOT EXISTS "archived_jobs_status_idx" ON orderworks."archived_jobs" ("status");
CREATE INDEX IF NOT EXISTS "archived_jobs_makerworks_created_at_idx" ON orderworks."archived_jobs" ("makerworks_created_at");

CREATE OR REPLACE FUNCTION orderworks."archive_completed_jobs"(retention_days INTEGER DEFAULT 90, batch_size INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  moved_count INTEGER;
BEGIN
  IF retention_days < 1 THEN
    retention_days := 1;
  END IF;
  IF batch_size < 1 THEN
    batch_size := 1;
  END IF;

  WITH candidates AS (
    SELECT j.*
    FROM orderworks."jobs" j
    WHERE j."status" = 'completed'
      AND j."makerworks_created_at" < NOW() - make_interval(days => retention_days)
    ORDER BY j."makerworks_created_at" ASC, j."id" ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  ),
  inserted AS (
    INSERT INTO orderworks."archived_jobs" (
      "id",
      "payment_intent_id",
      "total_cents",
      "currency",
      "line_items",
      "shipping",
      "metadata",
      "user_id",
      "customer_email",
      "makerworks_created_at",
      "makerworks_updated_at",
      "status",
      "notes",
      "payment_method",
      "payment_status",
      "receipt_sent_at",
      "receipt_send_count",
      "invoice_sent_at",
      "invoice_send_count",
      "fulfillment_status",
      "fulfilled_at",
      "queue_position",
      "viewed_at",
      "original_created_at",
      "original_updated_at",
      "archived_at"
    )
    SELECT
      c."id",
      c."paymentIntentId",
      c."totalCents",
      c."currency",
      c."lineItems",
      c."shipping",
      c."metadata",
      c."userId",
      c."customerEmail",
      c."makerworks_created_at",
      c."makerworks_updated_at",
      c."status",
      c."notes",
      c."payment_method",
      c."payment_status",
      c."receipt_sent_at",
      c."receipt_send_count",
      c."invoice_sent_at",
      c."invoice_send_count",
      c."fulfillment_status",
      c."fulfilled_at",
      c."queue_position",
      c."viewed_at",
      c."createdAt",
      c."updatedAt",
      NOW()
    FROM candidates c
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  ),
  deleted AS (
    DELETE FROM orderworks."jobs" j
    USING inserted i
    WHERE j."id" = i."id"
    RETURNING j."id"
  )
  SELECT COUNT(*)::int INTO moved_count FROM deleted;

  IF moved_count > 0 THEN
    WITH ordered AS (
      SELECT j."id", (ROW_NUMBER() OVER (ORDER BY j."queue_position" ASC, j."id" ASC) - 1)::int AS next_pos
      FROM orderworks."jobs" j
    )
    UPDATE orderworks."jobs" j
    SET "queue_position" = o.next_pos
    FROM ordered o
    WHERE j."id" = o."id"
      AND j."queue_position" <> o.next_pos;
  END IF;

  RETURN moved_count;
END;
$$;

DROP MATERIALIZED VIEW IF EXISTS orderworks."job_dashboard_summary";
CREATE MATERIALIZED VIEW orderworks."job_dashboard_summary" AS
SELECT
  'default'::text AS "singleton_key",
  NOW()::timestamp(3) AS "generated_at",
  COUNT(*)::int AS "total_jobs",
  COUNT(*) FILTER (WHERE "status" = 'pending')::int AS "pending_jobs",
  COUNT(*) FILTER (WHERE "status" = 'printing')::int AS "printing_jobs",
  COUNT(*) FILTER (WHERE "status" = 'completed')::int AS "completed_jobs",
  COUNT(*) FILTER (WHERE "fulfillment_status" = 'ready')::int AS "ready_jobs",
  COUNT(*) FILTER (WHERE "fulfillment_status" = 'shipped')::int AS "shipped_jobs",
  COUNT(*) FILTER (WHERE "fulfillment_status" = 'picked_up')::int AS "picked_up_jobs",
  COUNT(*) FILTER (WHERE "viewed_at" IS NULL)::int AS "unviewed_jobs",
  COUNT(*) FILTER (WHERE "status" <> 'completed' AND "makerworks_created_at" <= NOW() - INTERVAL '1 day')::int AS "aging_over_1d",
  COUNT(*) FILTER (WHERE "status" <> 'completed' AND "makerworks_created_at" <= NOW() - INTERVAL '3 days')::int AS "aging_over_3d",
  COUNT(*) FILTER (WHERE "status" <> 'completed' AND "makerworks_created_at" <= NOW() - INTERVAL '7 days')::int AS "aging_over_7d",
  (SELECT COUNT(*)::int FROM orderworks."archived_jobs") AS "archived_total"
FROM orderworks."jobs";

CREATE UNIQUE INDEX IF NOT EXISTS "job_dashboard_summary_singleton_key_idx"
  ON orderworks."job_dashboard_summary" ("singleton_key");

CREATE OR REPLACE FUNCTION orderworks."refresh_job_dashboard_summary"()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW orderworks."job_dashboard_summary";
END;
$$;

WITH ordered AS (
  SELECT j."id", (ROW_NUMBER() OVER (ORDER BY j."queue_position" ASC, j."id" ASC) - 1)::int AS next_pos
  FROM orderworks."jobs" j
)
UPDATE orderworks."jobs" j
SET "queue_position" = o.next_pos
FROM ordered o
WHERE j."id" = o."id"
  AND j."queue_position" <> o.next_pos;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_queue_position_nonnegative'
  ) THEN
    ALTER TABLE orderworks."jobs"
      ADD CONSTRAINT "jobs_queue_position_nonnegative" CHECK ("queue_position" >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "jobs_queue_position_key" ON orderworks."jobs" ("queue_position");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_receipt_send_count_nonnegative'
  ) THEN
    ALTER TABLE orderworks."jobs"
      ADD CONSTRAINT "jobs_receipt_send_count_nonnegative" CHECK ("receipt_send_count" >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_invoice_send_count_nonnegative'
  ) THEN
    ALTER TABLE orderworks."jobs"
      ADD CONSTRAINT "jobs_invoice_send_count_nonnegative" CHECK ("invoice_send_count" >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orderworks."job_status_transition_rules" (
  "from_status" "JobStatus" NOT NULL,
  "to_status" "JobStatus" NOT NULL,
  PRIMARY KEY ("from_status", "to_status")
);

INSERT INTO orderworks."job_status_transition_rules" ("from_status", "to_status")
VALUES
  ('pending', 'pending'),
  ('pending', 'printing'),
  ('pending', 'completed'),
  ('printing', 'printing'),
  ('printing', 'completed'),
  ('printing', 'pending'),
  ('completed', 'completed'),
  ('completed', 'pending'),
  ('completed', 'printing')
ON CONFLICT ("from_status", "to_status") DO NOTHING;

CREATE OR REPLACE FUNCTION orderworks."enforce_job_status_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NOT EXISTS (
      SELECT 1
      FROM orderworks."job_status_transition_rules" r
      WHERE r."from_status" = OLD."status"
        AND r."to_status" = NEW."status"
    ) THEN
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD."status", NEW."status";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "jobs_enforce_status_transition_trigger" ON orderworks."jobs";
CREATE TRIGGER "jobs_enforce_status_transition_trigger"
BEFORE UPDATE OF "status" ON orderworks."jobs"
FOR EACH ROW
EXECUTE FUNCTION orderworks."enforce_job_status_transition"();
