import { Prisma } from "@/generated/prisma/client";
import { JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getNextQueuePosition } from "@/lib/job-queue";

const MIN_SYNC_INTERVAL_MS = 15_000;

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
  makerworksCreatedAt: Date;
  updatedAt: Date;
  status: string | null;
  notes: string | null;
};

let inflightSync: Promise<number> | null = null;
let lastSyncStart = 0;
let lastSuccessfulSyncAt: Date | null = null;
let lastMakerWorksSourceUpdatedAt: Date | null = null;

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
      source."makerworks_created_at" AS "makerworksCreatedAt",
      source."updatedAt" AS "updatedAt",
      source.status::text AS status,
      source.notes
    FROM public."jobs" AS source
  `;

  if (!since) {
    return prisma.$queryRaw<MakerWorksJobRow[]>(
      Prisma.sql`${selectFragment} ORDER BY "makerworks_created_at" ASC`,
    );
  }

  return prisma.$queryRaw<MakerWorksJobRow[]>(
    Prisma.sql`${selectFragment} WHERE "updatedAt" > ${since} ORDER BY "updatedAt" ASC`,
  );
}

async function performSync() {
  const jobTableExists = await makerWorksJobsTableExists();
  if (!jobTableExists) {
    lastMakerWorksSourceUpdatedAt = null;
    lastSuccessfulSyncAt = new Date();
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
    return 0;
  }

  const hasJobFormTable = await makerWorksJobFormTableExists();
  const rows = await fetchMakerWorksRows(hasJobFormTable, needsFullSync ? null : lastSynced);

  if (rows.length === 0) {
    lastSuccessfulSyncAt = new Date();
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

  let nextQueuePosition: number | null = null;
  async function assignQueuePosition() {
    if (nextQueuePosition === null) {
      nextQueuePosition = await getNextQueuePosition();
    }
    const value = nextQueuePosition;
    nextQueuePosition += 1;
    return value;
  }

  let processed = 0;

  for (const row of rows) {
    const normalizeString = (value: string | null) => (value && value.trim().length > 0 ? value : null);
    const sharedData: Prisma.JobUpdateInput = {
      paymentIntentId: row.paymentIntentId,
      totalCents: row.totalCents,
      currency: row.currency,
      lineItems: row.lineItems as Prisma.InputJsonValue,
      shipping: row.shipping === null ? Prisma.JsonNull : (row.shipping as Prisma.InputJsonValue),
      metadata: row.metadata === null ? Prisma.JsonNull : (row.metadata as Prisma.InputJsonValue),
      userId: normalizeString(row.userId),
      customerEmail: normalizeString(row.customerEmail),
      paymentMethod: normalizeString(row.paymentMethod),
      paymentStatus: normalizeString(row.paymentStatus),
      makerworksCreatedAt: row.makerworksCreatedAt,
      makerworksUpdatedAt: row.updatedAt,
    };

    if (existingIds.has(row.id)) {
      await prisma.job.update({
        where: { id: row.id },
        data: sharedData,
      });
      processed += 1;
    } else {
      const queuePosition = await assignQueuePosition();
      await prisma.job.create({
        data: {
          id: row.id,
          paymentIntentId: row.paymentIntentId,
          totalCents: row.totalCents,
          currency: row.currency,
          lineItems: row.lineItems as Prisma.InputJsonValue,
          shipping: row.shipping === null ? Prisma.JsonNull : (row.shipping as Prisma.InputJsonValue),
          metadata: row.metadata === null ? Prisma.JsonNull : (row.metadata as Prisma.InputJsonValue),
          userId: normalizeString(row.userId),
          customerEmail: normalizeString(row.customerEmail),
          paymentMethod: normalizeString(row.paymentMethod),
          paymentStatus: normalizeString(row.paymentStatus),
          makerworksCreatedAt: row.makerworksCreatedAt,
          makerworksUpdatedAt: row.updatedAt,
          queuePosition,
          status: normalizeJobStatus(row.status),
          notes: row.notes ?? null,
        },
      });
      processed += 1;
    }
  }

  lastSuccessfulSyncAt = new Date();
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
  };
}
