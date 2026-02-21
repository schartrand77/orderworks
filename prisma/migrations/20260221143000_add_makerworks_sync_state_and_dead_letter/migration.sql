CREATE TABLE IF NOT EXISTS "makerworks_sync_state" (
  "singleton_key" TEXT PRIMARY KEY DEFAULT 'default',
  "last_source_updated_at" TIMESTAMP(3),
  "last_successful_sync_at" TIMESTAMP(3),
  "last_sync_started_at" TIMESTAMP(3),
  "last_sync_duration_ms" INTEGER,
  "last_sync_processed" INTEGER NOT NULL DEFAULT 0,
  "last_run_mode" TEXT,
  "last_full_reconcile_at" TIMESTAMP(3),
  "last_error" TEXT,
  "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  "last_slow_query_count" INTEGER NOT NULL DEFAULT 0,
  "slow_query_count_total" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "makerworks_sync_state" ("singleton_key")
VALUES ('default')
ON CONFLICT ("singleton_key") DO NOTHING;

CREATE TABLE IF NOT EXISTS "makerworks_sync_dead_letter" (
  "id" BIGSERIAL PRIMARY KEY,
  "source_job_id" TEXT NOT NULL UNIQUE,
  "payment_intent_id" TEXT,
  "payload" JSONB NOT NULL,
  "error_message" TEXT NOT NULL,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_failed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "makerworks_sync_dead_letter_unresolved_next_retry_idx"
  ON "makerworks_sync_dead_letter" ("resolved_at", "next_retry_at");

CREATE TABLE IF NOT EXISTS "internal_metrics_state" (
  "singleton_key" TEXT PRIMARY KEY DEFAULT 'default',
  "login_failures_total" INTEGER NOT NULL DEFAULT 0,
  "queue_mutation_total" INTEGER NOT NULL DEFAULT 0,
  "queue_mutation_duration_ms_sum" BIGINT NOT NULL DEFAULT 0,
  "queue_mutation_duration_ms_max" INTEGER NOT NULL DEFAULT 0,
  "sync_rows_total" BIGINT NOT NULL DEFAULT 0,
  "sync_duration_ms_total" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "internal_metrics_state" ("singleton_key")
VALUES ('default')
ON CONFLICT ("singleton_key") DO NOTHING;
