import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

interface InternalMetricsSnapshot {
  loginFailuresTotal: number;
  queueMutationTotal: number;
  queueMutationDurationMsSum: number;
  queueMutationDurationMsMax: number;
  syncRowsTotal: number;
  syncDurationMsTotal: number;
}

const DEFAULT_SNAPSHOT: InternalMetricsSnapshot = {
  loginFailuresTotal: 0,
  queueMutationTotal: 0,
  queueMutationDurationMsSum: 0,
  queueMutationDurationMsMax: 0,
  syncRowsTotal: 0,
  syncDurationMsTotal: 0,
};

async function ensureMetricsRow() {
  await prisma.$executeRaw(
    Prisma.sql`
      CREATE TABLE IF NOT EXISTS orderworks."internal_metrics_state" (
        "singleton_key" TEXT PRIMARY KEY DEFAULT 'default',
        "login_failures_total" INTEGER NOT NULL DEFAULT 0,
        "queue_mutation_total" INTEGER NOT NULL DEFAULT 0,
        "queue_mutation_duration_ms_sum" BIGINT NOT NULL DEFAULT 0,
        "queue_mutation_duration_ms_max" INTEGER NOT NULL DEFAULT 0,
        "sync_rows_total" BIGINT NOT NULL DEFAULT 0,
        "sync_duration_ms_total" BIGINT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
  );
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO orderworks."internal_metrics_state" ("singleton_key")
      VALUES ('default')
      ON CONFLICT ("singleton_key") DO NOTHING
    `,
  );
}

export async function incrementLoginFailures(count = 1) {
  try {
    await ensureMetricsRow();
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE orderworks."internal_metrics_state"
        SET
          "login_failures_total" = "login_failures_total" + ${count},
          "updated_at" = NOW()
        WHERE "singleton_key" = 'default'
      `,
    );
  } catch (error) {
    console.warn("Unable to record login failure metrics.", error);
  }
}

export async function recordQueueMutationLatency(durationMs: number) {
  try {
    await ensureMetricsRow();
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE orderworks."internal_metrics_state"
        SET
          "queue_mutation_total" = "queue_mutation_total" + 1,
          "queue_mutation_duration_ms_sum" = "queue_mutation_duration_ms_sum" + ${Math.max(0, Math.round(durationMs))},
          "queue_mutation_duration_ms_max" = GREATEST("queue_mutation_duration_ms_max", ${Math.max(0, Math.round(durationMs))}),
          "updated_at" = NOW()
        WHERE "singleton_key" = 'default'
      `,
    );
  } catch (error) {
    console.warn("Unable to record queue mutation metrics.", error);
  }
}

export async function recordSyncRunMetrics(processedRows: number, durationMs: number) {
  try {
    await ensureMetricsRow();
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE orderworks."internal_metrics_state"
        SET
          "sync_rows_total" = "sync_rows_total" + ${Math.max(0, Math.round(processedRows))},
          "sync_duration_ms_total" = "sync_duration_ms_total" + ${Math.max(0, Math.round(durationMs))},
          "updated_at" = NOW()
        WHERE "singleton_key" = 'default'
      `,
    );
  } catch (error) {
    console.warn("Unable to record sync metrics.", error);
  }
}

export async function readInternalMetricsSnapshot() {
  try {
    await ensureMetricsRow();
    const rows = await prisma.$queryRaw<InternalMetricsSnapshot[]>(
      Prisma.sql`
        SELECT
          "login_failures_total" AS "loginFailuresTotal",
          "queue_mutation_total" AS "queueMutationTotal",
          "queue_mutation_duration_ms_sum"::int AS "queueMutationDurationMsSum",
          "queue_mutation_duration_ms_max" AS "queueMutationDurationMsMax",
          "sync_rows_total"::int AS "syncRowsTotal",
          "sync_duration_ms_total"::int AS "syncDurationMsTotal"
        FROM orderworks."internal_metrics_state"
        WHERE "singleton_key" = 'default'
        LIMIT 1
      `,
    );
    return rows[0] ?? DEFAULT_SNAPSHOT;
  } catch (error) {
    console.warn("Unable to read internal metrics snapshot.", error);
    return DEFAULT_SNAPSHOT;
  }
}

export async function getInternalMetricsPayload() {
  const snapshot = await readInternalMetricsSnapshot();
  const syncSeconds = snapshot.syncDurationMsTotal > 0 ? snapshot.syncDurationMsTotal / 1000 : 0;
  const queueAvgMs =
    snapshot.queueMutationTotal > 0 ? snapshot.queueMutationDurationMsSum / snapshot.queueMutationTotal : 0;
  const syncRowsPerSecond = syncSeconds > 0 ? snapshot.syncRowsTotal / syncSeconds : 0;

  return {
    loginFailuresTotal: snapshot.loginFailuresTotal,
    queueMutation: {
      total: snapshot.queueMutationTotal,
      avgDurationMs: Math.round(queueAvgMs),
      maxDurationMs: snapshot.queueMutationDurationMsMax,
    },
    sync: {
      rowsTotal: snapshot.syncRowsTotal,
      totalDurationMs: snapshot.syncDurationMsTotal,
      rowsPerSecond: Number(syncRowsPerSecond.toFixed(2)),
    },
  };
}
