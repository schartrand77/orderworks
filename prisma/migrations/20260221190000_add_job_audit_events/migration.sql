CREATE TABLE IF NOT EXISTS orderworks."job_audit_events" (
  "id" BIGSERIAL PRIMARY KEY,
  "job_id" TEXT NOT NULL,
  "payment_intent_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "job_audit_events_payment_intent_id_created_at_idx"
  ON orderworks."job_audit_events" ("payment_intent_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "job_audit_events_job_id_created_at_idx"
  ON orderworks."job_audit_events" ("job_id", "created_at" DESC);
