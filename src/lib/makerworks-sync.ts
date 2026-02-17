import { Prisma } from "@/generated/prisma/client";
import { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getNextQueuePosition } from "@/lib/job-queue";

const MIN_SYNC_INTERVAL_MS = 15_000;
const DEFAULT_STALE_SYNC_MS = 60_000;
const UPDATE_CHUNK_SIZE = 100;
const INSERT_CHUNK_SIZE = 250;

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

let inflightSync: Promise<number> | null = null;
let lastSyncStart = 0;
let lastSuccessfulSyncAt: Date | null = null;
let lastMakerWorksSourceUpdatedAt: Date | null = null;
let lastSyncDurationMs: number | null = null;
let lastSyncProcessed = 0;

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function makerWorksJobsTableExists() {
  const [result] = await prisma.$queryRaw<{ exists: boolean }[]>(
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

async function makerWorksJobFormTableExists() {
  const [result] = await prisma.$queryRaw<{ exists: boolean }[]>(
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

async function fetchMakerWorksRows(hasJobFormTable: boolean, since?: Date | null) {
  const selectFragment = hasJobFormTable
    ? Prisma.sql`
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
  `
    : Prisma.sql`
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

  if (!since) {
    return prisma.$queryRaw<MakerWorksJobRow[]>(
      Prisma.sql`${selectFragment} ORDER BY source."makerworks_created_at" ASC`,
    );
  }

  return prisma.$queryRaw<MakerWorksJobRow[]>(
    Prisma.sql`${selectFragment} WHERE source."updatedAt" > ${since} ORDER BY source."updatedAt" ASC`,
  );
}

async function performSync() {
  const startedAt = Date.now();
  const jobTableExists = await makerWorksJobsTableExists();
  if (!jobTableExists) {
    lastMakerWorksSourceUpdatedAt = null;
    lastSuccessfulSyncAt = new Date();
    lastSyncDurationMs = Date.now() - startedAt;
    lastSyncProcessed = 0;
    return 0;
  }

  const [{ sourceLatest }] = await prisma.$queryRaw<{ sourceLatest: Date | null }[]>(
    Prisma.sql`SELECT MAX("updatedAt") AS "sourceLatest" FROM public."jobs"`,
  );
  lastMakerWorksSourceUpdatedAt = sourceLatest ?? null;

  const existingCount = await prisma.job.count();
  const latestSyncedRow =
    existingCount === 0
      ? null
      : await prisma.job.findFirst({
          orderBy: { makerworksUpdatedAt: "desc" },
          select: { makerworksUpdatedAt: true },
        });

  const lastSynced = latestSyncedRow?.makerworksUpdatedAt ?? null;
  const needsFullSync = existingCount === 0 || !lastSynced;

  if (!needsFullSync && sourceLatest && lastSynced && sourceLatest <= lastSynced) {
    lastSuccessfulSyncAt = new Date();
    lastSyncDurationMs = Date.now() - startedAt;
    lastSyncProcessed = 0;
    return 0;
  }

  const hasJobFormTable = await makerWorksJobFormTableExists();
  const rows = await fetchMakerWorksRows(hasJobFormTable, needsFullSync ? null : lastSynced);

  if (rows.length === 0) {
    lastSuccessfulSyncAt = new Date();
    lastSyncDurationMs = Date.now() - startedAt;
    lastSyncProcessed = 0;
    return 0;
  }

  const existingIds = new Set<string>();
  if (rows.length > 0) {
    const existing = await prisma.job.findMany({
      where: { id: { in: rows.map((row) => row.id) } },
      select: { id: true },
    });
    existing.forEach((record) => existingIds.add(record.id));
  }

  const normalizeString = (value: string | null) => (value && value.trim().length > 0 ? value : null);
  const toUpdate: { id: string; data: Prisma.JobUpdateInput }[] = [];
  const toInsert: MakerWorksJobRow[] = [];

  for (const row of rows) {
    const sharedData: Prisma.JobUpdateInput = {
      paymentIntentId: row.paymentIntentId,
      totalCents: row.totalCents,
      currency: row.currency,
      lineItems: row.lineItems as Prisma.InputJsonValue,
      shipping: row.shipping === null ? Prisma.DbNull : (row.shipping as Prisma.InputJsonValue),
      metadata: row.metadata === null ? Prisma.DbNull : (row.metadata as Prisma.InputJsonValue),
      userId: normalizeString(row.userId),
      customerEmail: normalizeString(row.customerEmail),
      paymentMethod: normalizeString(row.paymentMethod),
      paymentStatus: normalizeString(row.paymentStatus),
      fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillmentStatus),
      fulfilledAt: row.fulfilledAt ?? null,
      makerworksCreatedAt: row.makerworksCreatedAt,
      makerworksUpdatedAt: row.updatedAt,
    };

    if (existingIds.has(row.id)) {
      toUpdate.push({ id: row.id, data: sharedData });
    } else {
      toInsert.push(row);
    }
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const firstQueuePosition = await getNextQueuePosition();
    const createData: Prisma.JobCreateManyInput[] = toInsert.map((row, index) => ({
      id: row.id,
      paymentIntentId: row.paymentIntentId,
      totalCents: row.totalCents,
      currency: row.currency,
      lineItems: row.lineItems as Prisma.InputJsonValue,
      shipping: row.shipping === null ? Prisma.DbNull : (row.shipping as Prisma.InputJsonValue),
      metadata: row.metadata === null ? Prisma.DbNull : (row.metadata as Prisma.InputJsonValue),
      userId: normalizeString(row.userId),
      customerEmail: normalizeString(row.customerEmail),
      paymentMethod: normalizeString(row.paymentMethod),
      paymentStatus: normalizeString(row.paymentStatus),
      fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillmentStatus),
      fulfilledAt: row.fulfilledAt ?? null,
      makerworksCreatedAt: row.makerworksCreatedAt,
      makerworksUpdatedAt: row.updatedAt,
      queuePosition: firstQueuePosition + index,
      status: normalizeJobStatus(row.status),
      notes: row.notes ?? null,
    }));

    for (const insertChunk of chunk(createData, INSERT_CHUNK_SIZE)) {
      const result = await prisma.job.createMany({
        data: insertChunk,
        skipDuplicates: true,
      });
      inserted += result.count;
    }
  }

  for (const updateChunk of chunk(toUpdate, UPDATE_CHUNK_SIZE)) {
    await prisma.$transaction(
      updateChunk.map((entry) =>
        prisma.job.update({
          where: { id: entry.id },
          data: entry.data,
        }),
      ),
    );
  }

  const processed = inserted + toUpdate.length;
  lastSuccessfulSyncAt = new Date();
  lastSyncDurationMs = Date.now() - startedAt;
  lastSyncProcessed = processed;
  console.info(
    `[makerworks-sync] durationMs=${lastSyncDurationMs} rows=${rows.length} inserted=${inserted} updated=${toUpdate.length}`,
  );
  return processed;
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
  const syncPromise = performSync().finally(() => {
    inflightSync = null;
  });
  inflightSync = syncPromise;
  return syncPromise;
}

export function getMakerWorksSyncTelemetry() {
  return {
    lastSourceUpdatedAt: lastMakerWorksSourceUpdatedAt,
    lastSuccessfulSyncAt,
    lastSyncDurationMs,
    lastSyncProcessed,
  };
}

export function isMakerWorksSyncStale(maxAgeMs = DEFAULT_STALE_SYNC_MS) {
  if (!lastSuccessfulSyncAt) {
    return true;
  }
  return Date.now() - lastSuccessfulSyncAt.getTime() > maxAgeMs;
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
