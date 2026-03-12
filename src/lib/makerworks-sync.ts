import { Prisma } from "@/generated/prisma/client";
import { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getNextQueuePosition } from "@/lib/job-queue";
import { recordSyncRunMetrics } from "@/lib/internal-metrics";
import { logStructured } from "@/lib/observability";
import { triggerSummaryRefreshIfStale } from "@/lib/job-maintenance";

const MIN_SYNC_INTERVAL_MS = 15_000;
const DEFAULT_STALE_SYNC_MS = 60_000;
const FULL_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_KEY = 6_101_200_001;
const DEAD_LETTER_BASE_BACKOFF_MS = 5 * 60 * 1000;
const DEAD_LETTER_MAX_RETRIES = 5;
const DEAD_LETTER_MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;
const SYNC_SLOW_QUERY_THRESHOLD_MS = 750;

type MakerWorksJobRow = {
  id: string;
  paymentIntentId: string;
  totalCents: number;
  currency: string;
  lineItems: Prisma.JsonValue;
  shipping: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  userId: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  fulfilledAt: Date | null;
  makerworksCreatedAt: Date;
  updatedAt: Date;
  status: string | null;
  notes: string | null;
};

type SyncMode = "delta" | "full";

type SyncStateRow = {
  singletonKey: string;
  lastSourceUpdatedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncStartedAt: Date | null;
  lastSyncDurationMs: number | null;
  lastSyncProcessed: number;
  lastRunMode: string | null;
  lastFullReconcileAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastSlowQueryCount: number;
  slowQueryCountTotal: number;
};

type DeadLetterRow = {
  id: number;
  sourceJobId: string;
  retryCount: number;
  nextRetryAt: Date;
};

type SyncTelemetry = {
  lastSourceUpdatedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastSyncDurationMs: number | null;
  lastSyncProcessed: number;
  lastRunMode: SyncMode | null;
  lastFullReconcileAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastSlowQueryCount: number;
  slowQueryCountTotal: number;
};

let inflightSync: Promise<number> | null = null;
let lastSyncStart = 0;
let lastKnownTelemetry: SyncTelemetry = {
  lastSourceUpdatedAt: null,
  lastSuccessfulSyncAt: null,
  lastSyncDurationMs: null,
  lastSyncProcessed: 0,
  lastRunMode: null,
  lastFullReconcileAt: null,
  lastError: null,
  consecutiveFailures: 0,
  lastSlowQueryCount: 0,
  slowQueryCountTotal: 0,
};

function toSyncTelemetry(row: SyncStateRow): SyncTelemetry {
  return {
    lastSourceUpdatedAt: row.lastSourceUpdatedAt,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
    lastSyncDurationMs: row.lastSyncDurationMs,
    lastSyncProcessed: row.lastSyncProcessed ?? 0,
    lastRunMode: row.lastRunMode === "full" || row.lastRunMode === "delta" ? row.lastRunMode : null,
    lastFullReconcileAt: row.lastFullReconcileAt,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures ?? 0,
    lastSlowQueryCount: row.lastSlowQueryCount ?? 0,
    slowQueryCountTotal: row.slowQueryCountTotal ?? 0,
  };
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown sync error";
}

function normalizeString(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function normalizeJobStatus(value: string | null): JobStatus {
  switch (value) {
    case JobStatus.PRINTING:
    case "printing":
      return JobStatus.PRINTING;
    case JobStatus.COMPLETED:
    case "completed":
      return JobStatus.COMPLETED;
    default:
      return JobStatus.PENDING;
  }
}

function normalizeFulfillmentStatus(value: string | null): FulfillmentStatus {
  switch (value) {
    case "ready":
      return FulfillmentStatus.READY;
    case "shipped":
      return FulfillmentStatus.SHIPPED;
    case "picked_up":
      return FulfillmentStatus.PICKED_UP;
    default:
      return FulfillmentStatus.PENDING;
  }
}

function normalizeSourceRow(row: MakerWorksJobRow) {
  const id = normalizeString(row.id);
  if (!id) {
    throw new Error("Missing source id");
  }

  const paymentIntentId = normalizeString(row.paymentIntentId);
  if (!paymentIntentId) {
    throw new Error(`Missing paymentIntentId for source id ${id}`);
  }

  if (!Number.isFinite(row.totalCents) || row.totalCents < 0) {
    throw new Error(`Invalid totalCents for source id ${id}`);
  }

  const currency = normalizeString(row.currency)?.toLowerCase();
  if (!currency) {
    throw new Error(`Missing currency for source id ${id}`);
  }

  if (!Array.isArray(row.lineItems)) {
    throw new Error(`lineItems must be an array for source id ${id}`);
  }

  if (!(row.makerworksCreatedAt instanceof Date) || Number.isNaN(row.makerworksCreatedAt.getTime())) {
    throw new Error(`Invalid makerworksCreatedAt for source id ${id}`);
  }

  if (!(row.updatedAt instanceof Date) || Number.isNaN(row.updatedAt.getTime())) {
    throw new Error(`Invalid updatedAt for source id ${id}`);
  }

  return {
    id,
    paymentIntentId,
    totalCents: row.totalCents,
    currency,
    lineItems: row.lineItems,
    shipping: row.shipping,
    metadata: row.metadata,
    userId: normalizeString(row.userId),
    customerEmail: normalizeString(row.customerEmail),
    paymentMethod: normalizeString(row.paymentMethod),
    paymentStatus: normalizeString(row.paymentStatus),
    fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillmentStatus),
    fulfilledAt: row.fulfilledAt ?? null,
    makerworksCreatedAt: row.makerworksCreatedAt,
    makerworksUpdatedAt: row.updatedAt,
    status: normalizeJobStatus(row.status),
    notes: normalizeString(row.notes),
    sourcePayload: row,
  };
}

async function makerWorksJobsTableExistsInternal(db: Prisma.TransactionClient | typeof prisma) {
  const [result] = await db.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'jobs'
      ) AS "exists"
    `,
  );
  return result?.exists ?? false;
}

async function makerWorksJobFormTableExists(db: Prisma.TransactionClient | typeof prisma) {
  const [result] = await db.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'JobForm'
      ) AS "exists"
    `,
  );
  return result?.exists ?? false;
}

async function ensureSyncStateRow() {
  await prisma.$executeRaw(
    Prisma.sql`
      CREATE TABLE IF NOT EXISTS orderworks."makerworks_sync_state" (
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
      )
    `,
  );
  await prisma.$executeRaw(
    Prisma.sql`
      CREATE TABLE IF NOT EXISTS orderworks."makerworks_sync_dead_letter" (
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
      )
    `,
  );
  await prisma.$executeRaw(
    Prisma.sql`
      CREATE INDEX IF NOT EXISTS "makerworks_sync_dead_letter_unresolved_next_retry_idx"
      ON orderworks."makerworks_sync_dead_letter" ("resolved_at", "next_retry_at")
    `,
  );
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO orderworks."makerworks_sync_state" ("singleton_key")
      VALUES ('default')
      ON CONFLICT ("singleton_key") DO NOTHING
    `,
  );
}

async function readSyncState(db: Prisma.TransactionClient | typeof prisma) {
  const rows = await db.$queryRaw<SyncStateRow[]>(
    Prisma.sql`
      SELECT
        "singleton_key" AS "singletonKey",
        "last_source_updated_at" AS "lastSourceUpdatedAt",
        "last_successful_sync_at" AS "lastSuccessfulSyncAt",
        "last_sync_started_at" AS "lastSyncStartedAt",
        "last_sync_duration_ms" AS "lastSyncDurationMs",
        "last_sync_processed" AS "lastSyncProcessed",
        "last_run_mode" AS "lastRunMode",
        "last_full_reconcile_at" AS "lastFullReconcileAt",
        "last_error" AS "lastError",
        "consecutive_failures" AS "consecutiveFailures",
        "last_slow_query_count" AS "lastSlowQueryCount",
        "slow_query_count_total" AS "slowQueryCountTotal"
      FROM orderworks."makerworks_sync_state"
      WHERE "singleton_key" = 'default'
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

async function updateSyncState(
  db: Prisma.TransactionClient | typeof prisma,
  input: {
    lastSourceUpdatedAt?: Date | null;
    lastSuccessfulSyncAt?: Date | null;
    lastSyncStartedAt?: Date | null;
    lastSyncDurationMs?: number | null;
    lastSyncProcessed?: number;
    lastRunMode?: SyncMode | null;
    lastFullReconcileAt?: Date | null;
    lastError?: string | null;
    setLastError?: boolean;
    consecutiveFailures?: number | null;
    setConsecutiveFailures?: boolean;
    incrementConsecutiveFailuresBy?: number;
    lastSlowQueryCount?: number | null;
    setLastSlowQueryCount?: boolean;
    incrementSlowQueryCountTotalBy?: number;
  },
) {
  const lastErrorValue = input.setLastError ? (input.lastError ?? null) : null;
  const setLastSourceUpdatedAt = input.lastSourceUpdatedAt !== undefined;
  const setLastSuccessfulSyncAt = input.lastSuccessfulSyncAt !== undefined;
  const setLastSyncStartedAt = input.lastSyncStartedAt !== undefined;
  const setLastSyncDurationMs = input.lastSyncDurationMs !== undefined;
  const setLastSyncProcessed = input.lastSyncProcessed !== undefined;
  const setLastRunMode = input.lastRunMode !== undefined;
  const setLastFullReconcileAt = input.lastFullReconcileAt !== undefined;
  const setConsecutiveFailures = input.setConsecutiveFailures ?? false;
  const setLastSlowQueryCount = input.setLastSlowQueryCount ?? false;
  const incrementConsecutiveFailuresBy = input.incrementConsecutiveFailuresBy ?? 0;
  const incrementSlowQueryCountTotalBy = input.incrementSlowQueryCountTotalBy ?? 0;

  await db.$executeRaw(
    Prisma.sql`
      UPDATE orderworks."makerworks_sync_state"
      SET
        "last_source_updated_at" = CASE WHEN ${setLastSourceUpdatedAt} THEN ${input.lastSourceUpdatedAt ?? null} ELSE "last_source_updated_at" END,
        "last_successful_sync_at" = CASE WHEN ${setLastSuccessfulSyncAt} THEN ${input.lastSuccessfulSyncAt ?? null} ELSE "last_successful_sync_at" END,
        "last_sync_started_at" = CASE WHEN ${setLastSyncStartedAt} THEN ${input.lastSyncStartedAt ?? null} ELSE "last_sync_started_at" END,
        "last_sync_duration_ms" = CASE WHEN ${setLastSyncDurationMs} THEN ${input.lastSyncDurationMs ?? null} ELSE "last_sync_duration_ms" END,
        "last_sync_processed" = CASE WHEN ${setLastSyncProcessed} THEN ${input.lastSyncProcessed ?? null} ELSE "last_sync_processed" END,
        "last_run_mode" = CASE WHEN ${setLastRunMode} THEN ${input.lastRunMode ?? null} ELSE "last_run_mode" END,
        "last_full_reconcile_at" = CASE WHEN ${setLastFullReconcileAt} THEN ${input.lastFullReconcileAt ?? null} ELSE "last_full_reconcile_at" END,
        "last_error" = CASE WHEN ${input.setLastError ?? false} THEN ${lastErrorValue} ELSE "last_error" END,
        "consecutive_failures" = CASE
          WHEN ${setConsecutiveFailures} THEN ${input.consecutiveFailures ?? 0}
          ELSE "consecutive_failures" + ${Math.max(0, incrementConsecutiveFailuresBy)}
        END,
        "last_slow_query_count" = CASE
          WHEN ${setLastSlowQueryCount} THEN ${input.lastSlowQueryCount ?? 0}
          ELSE "last_slow_query_count"
        END,
        "slow_query_count_total" = "slow_query_count_total" + ${Math.max(0, incrementSlowQueryCountTotalBy)},
        "updated_at" = NOW()
      WHERE "singleton_key" = 'default'
    `,
  );
}

function hasElapsedSince(value: Date | null, intervalMs: number) {
  if (!value) {
    return true;
  }
  return Date.now() - value.getTime() >= intervalMs;
}

function selectSyncMode(force: boolean, state: SyncStateRow | null): SyncMode {
  if (force) {
    return "full";
  }
  if (!state?.lastSuccessfulSyncAt || hasElapsedSince(state.lastFullReconcileAt, FULL_RECONCILE_INTERVAL_MS)) {
    return "full";
  }
  return "delta";
}

async function fetchSourceLatestUpdatedAt(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ sourceLatest: Date | null }[]>(
    Prisma.sql`SELECT MAX("updatedAt") AS "sourceLatest" FROM public."jobs"`,
  );
  return row?.sourceLatest ?? null;
}

async function timed<T>(
  label: string,
  run: () => Promise<T>,
  onSlowQuery: (durationMs: number, label: string) => void,
) {
  const startedAt = Date.now();
  const result = await run();
  const durationMs = Date.now() - startedAt;
  if (durationMs >= SYNC_SLOW_QUERY_THRESHOLD_MS) {
    onSlowQuery(durationMs, label);
  }
  return result;
}

function sourceSelect(hasJobFormTable: boolean) {
  if (hasJobFormTable) {
    return Prisma.sql`
      SELECT
        source.id,
        source."paymentIntentId" AS "paymentIntentId",
        source."totalCents" AS "totalCents",
        source.currency,
        source."lineItems" AS "lineItems",
        source.shipping,
        source.metadata,
        source."userId" AS "userId",
        source."customerEmail" AS "customerEmail",
        jobform."payment_method" AS "paymentMethod",
        jobform."payment_status" AS "paymentStatus",
        jobform."fulfillment_status" AS "fulfillmentStatus",
        jobform."fulfilled_at" AS "fulfilledAt",
        source."makerworks_created_at" AS "makerworksCreatedAt",
        source."updatedAt" AS "updatedAt",
        source.status::text AS status,
        source.notes
      FROM public."jobs" AS source
      LEFT JOIN public."JobForm" AS jobform
        ON jobform."paymentIntentId" = source."paymentIntentId"
    `;
  }

  return Prisma.sql`
    SELECT
      source.id,
      source."paymentIntentId" AS "paymentIntentId",
      source."totalCents" AS "totalCents",
      source.currency,
      source."lineItems" AS "lineItems",
      source.shipping,
      source.metadata,
      source."userId" AS "userId",
      source."customerEmail" AS "customerEmail",
      NULL::text AS "paymentMethod",
      NULL::text AS "paymentStatus",
      NULL::text AS "fulfillmentStatus",
      NULL::timestamp AS "fulfilledAt",
      source."makerworks_created_at" AS "makerworksCreatedAt",
      source."updatedAt" AS "updatedAt",
      source.status::text AS status,
      source.notes
    FROM public."jobs" AS source
  `;
}

async function fetchSourceRowsSince(
  tx: Prisma.TransactionClient,
  hasJobFormTable: boolean,
  since: Date | null,
) {
  const select = sourceSelect(hasJobFormTable);
  if (!since) {
    return tx.$queryRaw<MakerWorksJobRow[]>(Prisma.sql`${select} ORDER BY source."updatedAt" ASC`);
  }
  return tx.$queryRaw<MakerWorksJobRow[]>(
    Prisma.sql`${select} WHERE source."updatedAt" > ${since} ORDER BY source."updatedAt" ASC`,
  );
}

async function fetchReadyDeadLetterRows(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<DeadLetterRow[]>(
    Prisma.sql`
      SELECT
        id,
        "source_job_id" AS "sourceJobId",
        "retry_count" AS "retryCount",
        "next_retry_at" AS "nextRetryAt"
      FROM orderworks."makerworks_sync_dead_letter"
      WHERE "resolved_at" IS NULL
        AND "next_retry_at" <= NOW()
      ORDER BY "next_retry_at" ASC
      LIMIT 500
    `,
  );
}

async function fetchSourceRowsByIds(
  tx: Prisma.TransactionClient,
  hasJobFormTable: boolean,
  ids: string[],
) {
  if (ids.length === 0) {
    return [] as MakerWorksJobRow[];
  }
  const select = sourceSelect(hasJobFormTable);
  return tx.$queryRaw<MakerWorksJobRow[]>(
    Prisma.sql`${select} WHERE source.id IN (${Prisma.join(ids)}) ORDER BY source."updatedAt" ASC`,
  );
}

function nextRetryAt(retryCount: number) {
  const exponent = Math.max(0, retryCount - 1);
  const delayMs = Math.min(DEAD_LETTER_MAX_BACKOFF_MS, DEAD_LETTER_BASE_BACKOFF_MS * 2 ** exponent);
  return new Date(Date.now() + delayMs);
}

async function recordDeadLetterFailure(
  tx: Prisma.TransactionClient,
  sourceRow: MakerWorksJobRow | null,
  sourceJobId: string,
  paymentIntentId: string | null,
  errorMessage: string,
  previous: DeadLetterRow | undefined,
) {
  const retryCount = Math.min(DEAD_LETTER_MAX_RETRIES, (previous?.retryCount ?? 0) + 1);
  const payloadJson = JSON.stringify(sourceRow ?? null);
  const nextRetry = nextRetryAt(retryCount);

  await tx.$executeRaw(
    Prisma.sql`
      INSERT INTO orderworks."makerworks_sync_dead_letter" (
        "source_job_id",
        "payment_intent_id",
        "payload",
        "error_message",
        "retry_count",
        "next_retry_at",
        "last_failed_at",
        "resolved_at",
        "updated_at"
      )
      VALUES (
        ${sourceJobId},
        ${paymentIntentId},
        ${payloadJson}::jsonb,
        ${errorMessage},
        ${retryCount},
        ${nextRetry},
        NOW(),
        NULL,
        NOW()
      )
      ON CONFLICT ("source_job_id")
      DO UPDATE SET
        "payment_intent_id" = EXCLUDED."payment_intent_id",
        "payload" = EXCLUDED."payload",
        "error_message" = EXCLUDED."error_message",
        "retry_count" = EXCLUDED."retry_count",
        "next_retry_at" = EXCLUDED."next_retry_at",
        "last_failed_at" = EXCLUDED."last_failed_at",
        "resolved_at" = NULL,
        "updated_at" = NOW()
    `,
  );
}

async function resolveDeadLetter(tx: Prisma.TransactionClient, sourceJobId: string) {
  await tx.$executeRaw(
    Prisma.sql`
      UPDATE orderworks."makerworks_sync_dead_letter"
      SET "resolved_at" = NOW(), "updated_at" = NOW()
      WHERE "source_job_id" = ${sourceJobId}
        AND "resolved_at" IS NULL
    `,
  );
}

async function performSyncWithLock(force: boolean) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs);

  await ensureSyncStateRow();

  return prisma.$transaction(async (tx) => {
    let slowQueryCount = 0;
    const noteSlowQuery = (durationMs: number, label: string) => {
      slowQueryCount += 1;
      logStructured("warn", "makerworks_sync_slow_query", {
        requestId: "makerworks-sync",
        route: "makerworks-sync",
        durationMs,
        label,
      });
    };

    const [lockResult] = await tx.$queryRaw<{ acquired: boolean }[]>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS acquired`,
    );

    if (!lockResult?.acquired) {
      return 0;
    }

    const state = await readSyncState(tx);
    const mode = selectSyncMode(force, state);

    await updateSyncState(tx, {
      lastSyncStartedAt: startedAt,
      lastRunMode: mode,
      lastError: null,
      setLastError: true,
    });

    const sourceTableExists = await makerWorksJobsTableExistsInternal(tx);
    if (!sourceTableExists) {
      const finishedAt = new Date();
      const durationMs = Date.now() - startedAtMs;
      await updateSyncState(tx, {
        lastSourceUpdatedAt: null,
        lastSuccessfulSyncAt: finishedAt,
        lastSyncDurationMs: durationMs,
        lastSyncProcessed: 0,
        lastFullReconcileAt: mode === "full" ? finishedAt : undefined,
        lastError: null,
        setLastError: true,
        consecutiveFailures: 0,
        setConsecutiveFailures: true,
        lastSlowQueryCount: 0,
        setLastSlowQueryCount: true,
      });
      return 0;
    }

    const sourceLatest = await timed("source_latest", () => fetchSourceLatestUpdatedAt(tx), noteSlowQuery);
    const hasJobFormTable = await makerWorksJobFormTableExists(tx);

    const readyDeadLetters = await timed("dead_letters_ready", () => fetchReadyDeadLetterRows(tx), noteSlowQuery);
    const readyDeadLetterById = new Map<string, DeadLetterRow>();
    readyDeadLetters.forEach((row) => readyDeadLetterById.set(row.sourceJobId, row));
    const retryIds = readyDeadLetters.map((row) => row.sourceJobId);

    const since = mode === "delta" ? state?.lastSourceUpdatedAt ?? null : null;
    const deltaRows = await timed(
      "source_delta_rows",
      () => fetchSourceRowsSince(tx, hasJobFormTable, since),
      noteSlowQuery,
    );
    const retryRows = await timed(
      "source_retry_rows",
      () => fetchSourceRowsByIds(tx, hasJobFormTable, retryIds),
      noteSlowQuery,
    );

    const mergedById = new Map<string, MakerWorksJobRow>();
    for (const row of deltaRows) {
      mergedById.set(row.id, row);
    }
    for (const row of retryRows) {
      mergedById.set(row.id, row);
    }

    const missingRetryIds = retryIds.filter((id) => !mergedById.has(id));
    for (const missingId of missingRetryIds) {
      const dead = readyDeadLetterById.get(missingId);
      await recordDeadLetterFailure(
        tx,
        null,
        missingId,
        null,
        "Source row no longer exists in MakerWorks public.jobs",
        dead,
      );
    }

    const rows = Array.from(mergedById.values()).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    if (rows.length === 0 && sourceLatest && state?.lastSourceUpdatedAt && sourceLatest <= state.lastSourceUpdatedAt) {
      const finishedAt = new Date();
      const durationMs = Date.now() - startedAtMs;
      await updateSyncState(tx, {
        lastSourceUpdatedAt: sourceLatest,
        lastSuccessfulSyncAt: finishedAt,
        lastSyncDurationMs: durationMs,
        lastSyncProcessed: 0,
        lastFullReconcileAt: mode === "full" ? finishedAt : undefined,
        lastError: null,
        setLastError: true,
        consecutiveFailures: 0,
        setConsecutiveFailures: true,
        lastSlowQueryCount: slowQueryCount,
        setLastSlowQueryCount: true,
        incrementSlowQueryCountTotalBy: slowQueryCount,
      });
      return 0;
    }

    const existing = await timed(
      "local_existing_rows",
      () =>
        tx.job.findMany({
          where: { id: { in: rows.map((row) => row.id) } },
          select: { id: true },
        }),
      noteSlowQuery,
    );
    const existingIds = new Set(existing.map((row) => row.id));

    let nextQueuePosition = await getNextQueuePosition();
    let inserted = 0;
    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      const deadLetter = readyDeadLetterById.get(row.id);
      try {
        const normalized = normalizeSourceRow(row);

        const sharedData: Prisma.JobUpdateInput = {
          paymentIntentId: normalized.paymentIntentId,
          totalCents: normalized.totalCents,
          currency: normalized.currency,
          lineItems: normalized.lineItems as Prisma.InputJsonValue,
          shipping:
            normalized.shipping === null ? Prisma.DbNull : (normalized.shipping as Prisma.InputJsonValue),
          metadata:
            normalized.metadata === null ? Prisma.DbNull : (normalized.metadata as Prisma.InputJsonValue),
          userId: normalized.userId,
          customerEmail: normalized.customerEmail,
          paymentMethod: normalized.paymentMethod,
          paymentStatus: normalized.paymentStatus,
          fulfillmentStatus: normalized.fulfillmentStatus,
          fulfilledAt: normalized.fulfilledAt,
          makerworksCreatedAt: normalized.makerworksCreatedAt,
          makerworksUpdatedAt: normalized.makerworksUpdatedAt,
        };

        if (existingIds.has(normalized.id)) {
          await tx.job.update({
            where: { id: normalized.id },
            data: sharedData,
          });
          updated += 1;
        } else {
          await tx.job.create({
            data: {
              id: normalized.id,
              paymentIntentId: normalized.paymentIntentId,
              totalCents: normalized.totalCents,
              currency: normalized.currency,
              lineItems: normalized.lineItems as Prisma.InputJsonValue,
              shipping:
                normalized.shipping === null ? Prisma.DbNull : (normalized.shipping as Prisma.InputJsonValue),
              metadata:
                normalized.metadata === null ? Prisma.DbNull : (normalized.metadata as Prisma.InputJsonValue),
              userId: normalized.userId,
              customerEmail: normalized.customerEmail,
              paymentMethod: normalized.paymentMethod,
              paymentStatus: normalized.paymentStatus,
              fulfillmentStatus: normalized.fulfillmentStatus,
              fulfilledAt: normalized.fulfilledAt,
              makerworksCreatedAt: normalized.makerworksCreatedAt,
              makerworksUpdatedAt: normalized.makerworksUpdatedAt,
              queuePosition: nextQueuePosition,
              status: normalized.status,
              notes: normalized.notes,
            },
          });
          nextQueuePosition += 1;
          inserted += 1;
          existingIds.add(normalized.id);
        }

        await resolveDeadLetter(tx, normalized.id);
      } catch (error) {
        failed += 1;
        await recordDeadLetterFailure(
          tx,
          row,
          normalizeString(row.id) ?? `unknown-${Date.now()}`,
          normalizeString(row.paymentIntentId),
          normalizeErrorMessage(error),
          deadLetter,
        );
      }
    }

    const processed = inserted + updated;
    const finishedAt = new Date();
    const durationMs = Date.now() - startedAtMs;
    const runError = failed > 0 ? `${failed} row(s) moved to dead-letter queue` : null;

    await updateSyncState(tx, {
      lastSourceUpdatedAt: sourceLatest,
      lastSuccessfulSyncAt: finishedAt,
      lastSyncDurationMs: durationMs,
      lastSyncProcessed: processed,
      lastFullReconcileAt: mode === "full" ? finishedAt : undefined,
      lastError: runError,
      setLastError: true,
      consecutiveFailures: 0,
      setConsecutiveFailures: true,
      lastSlowQueryCount: slowQueryCount,
      setLastSlowQueryCount: true,
      incrementSlowQueryCountTotalBy: slowQueryCount,
    });

    await recordSyncRunMetrics(processed, durationMs);
    void triggerSummaryRefreshIfStale();

    logStructured("info", "makerworks_sync_completed", {
      requestId: "makerworks-sync",
      route: "makerworks-sync",
      durationMs,
      mode,
      rows: rows.length,
      inserted,
      updated,
      failed,
      slowQueryCount,
    });

    return processed;
  });
}

export async function syncMakerWorksJobs(force = false) {
  const now = Date.now();
  if (!force) {
    if (inflightSync) {
      return inflightSync;
    }
    if (now - lastSyncStart < MIN_SYNC_INTERVAL_MS) {
      return 0;
    }
  }

  lastSyncStart = now;
  const syncPromise = performSyncWithLock(force)
    .catch(async (error) => {
      const message = normalizeErrorMessage(error);
      const durationMs = Date.now() - now;
      try {
        await ensureSyncStateRow();
        await updateSyncState(prisma, {
          lastSyncDurationMs: durationMs,
          lastError: message,
          setLastError: true,
          incrementConsecutiveFailuresBy: 1,
        });
      } catch (persistError) {
        console.error("Failed to persist MakerWorks sync error.", persistError);
      }
      logStructured("error", "makerworks_sync_failed", {
        requestId: "makerworks-sync",
        route: "makerworks-sync",
        durationMs,
        error: message,
      });
      throw error;
    })
    .finally(async () => {
      inflightSync = null;
      try {
        await ensureSyncStateRow();
        const state = await readSyncState(prisma);
        if (state) {
          lastKnownTelemetry = toSyncTelemetry(state);
        }
      } catch (error) {
        console.error("Failed to refresh MakerWorks sync telemetry cache.", error);
      }
    });

  inflightSync = syncPromise;
  return syncPromise;
}

export async function getMakerWorksSyncTelemetry() {
  try {
    await ensureSyncStateRow();
    const state = await readSyncState(prisma);
    if (state) {
      lastKnownTelemetry = toSyncTelemetry(state);
    }
  } catch (error) {
    console.error("Failed to read MakerWorks sync telemetry from DB.", error);
  }
  return lastKnownTelemetry;
}

export function isMakerWorksSyncStale(maxAgeMs = DEFAULT_STALE_SYNC_MS) {
  if (!lastKnownTelemetry.lastSuccessfulSyncAt) {
    return true;
  }
  return Date.now() - lastKnownTelemetry.lastSuccessfulSyncAt.getTime() > maxAgeMs;
}

export function triggerMakerWorksSyncIfStale(maxAgeMs = DEFAULT_STALE_SYNC_MS) {
  if (!isMakerWorksSyncStale(maxAgeMs)) {
    return false;
  }
  void syncMakerWorksJobs().catch((error) => {
    console.error("Background MakerWorks sync failed.", error);
  });
  return true;
}

export async function makerWorksJobsTableExists() {
  return makerWorksJobsTableExistsInternal(prisma);
}
