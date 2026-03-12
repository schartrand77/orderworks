import { Suspense } from "react";
import Link from "next/link";
import type { JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { triggerMakerWorksSyncIfStale } from "@/lib/makerworks-sync";
import { triggerMaintenanceIfDue, triggerSummaryRefreshIfStale } from "@/lib/job-maintenance";
import { classifyJobExceptions } from "@/lib/job-exceptions";
import { JobFilters } from "@/components/job-filters";
import { JobTable } from "@/components/job-table";

export const dynamic = "force-dynamic";
const DEFAULT_PAGE_SIZE = 75;
const MAX_PAGE_SIZE = 100;

interface SearchParams {
  [key: string]: string | string[] | undefined;
  status?: string | string[];
  createdFrom?: string | string[];
  createdTo?: string | string[];
  queue?: string | string[];
}

function toURLSearchParams(searchParams?: SearchParams) {
  const params = new URLSearchParams();
  if (!searchParams) {
    return params;
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else if (value) {
      params.append(key, value);
    }
  }
  return params;
}

function extractSingle(value?: string | string[]) {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[value.length - 1] : value;
}

function parsePageSize(value?: string) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function encodeCursor(queuePosition: number, id: string) {
  return `${queuePosition}:${id}`;
}

function parseCursor(cursor?: string) {
  if (!cursor) {
    return null;
  }
  const [queuePositionText, ...idParts] = cursor.split(":");
  const queuePosition = Number.parseInt(queuePositionText ?? "", 10);
  const id = idParts.join(":");
  if (!Number.isFinite(queuePosition) || !id) {
    return null;
  }
  return { queuePosition, id };
}

async function JobsSection({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const params = toURLSearchParams(resolvedSearchParams);
  let error: string | null = null;
  let statuses: JobStatus[] = [];
  let createdFrom: Date | undefined;
  let createdTo: Date | undefined;
  const limit = parsePageSize(extractSingle(resolvedSearchParams?.limit));
  const cursorValue = extractSingle(resolvedSearchParams?.after);
  const cursor = parseCursor(cursorValue);
  const queueMode = extractSingle(resolvedSearchParams?.queue);
  const isExceptionQueueMode = queueMode === "exceptions";
  let jobs: {
    id: string;
    paymentIntentId: string;
    queuePosition: number;
    viewedAt: Date | null;
    status: JobStatus;
    totalCents: number;
    currency: string;
    makerworksCreatedAt: Date;
    customerEmail: string | null;
    paymentMethod: string | null;
    paymentStatus: string | null;
  }[] = [];
  let nextCursor: string | null = null;

  try {
    const filters = parseJobFilters(params);
    statuses = filters.statuses;
    createdFrom = filters.createdFrom;
    createdTo = filters.createdTo;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Invalid filters";
  }

  try {
    triggerMakerWorksSyncIfStale();
    void triggerMaintenanceIfDue();
    void triggerSummaryRefreshIfStale();

    const rows = await prisma.job.findMany({
      where: {
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(createdFrom || createdTo
          ? {
              makerworksCreatedAt: {
                ...(createdFrom ? { gte: createdFrom } : {}),
                ...(createdTo ? { lte: createdTo } : {}),
              },
            }
          : {}),
        ...(!isExceptionQueueMode && cursor
          ? {
              OR: [
                { queuePosition: { gt: cursor.queuePosition } },
                { queuePosition: cursor.queuePosition, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [
        { queuePosition: "asc" },
        { id: "asc" },
      ],
      take: isExceptionQueueMode ? Math.max(limit * 6, 300) : limit + 1,
      select: {
        id: true,
        paymentIntentId: true,
        queuePosition: true,
        viewedAt: true,
        status: true,
        totalCents: true,
        currency: true,
        makerworksCreatedAt: true,
        customerEmail: true,
        paymentMethod: true,
        paymentStatus: true,
        metadata: true,
        lineItems: true,
        notes: true,
        receiptSentAt: true,
        updatedAt: true,
      },
    });

    const filteredRows = isExceptionQueueMode
      ? rows.filter((job) => classifyJobExceptions(job).length > 0)
      : rows;

    if (!isExceptionQueueMode && filteredRows.length > limit) {
      const next = filteredRows[limit - 1];
      if (next) {
        nextCursor = encodeCursor(next.queuePosition, next.id);
      }
      jobs = filteredRows.slice(0, limit);
    } else {
      jobs = filteredRows.slice(0, limit);
    }
  } catch (cause) {
    if (!error) {
      error = cause instanceof Error ? cause.message : "Unable to load jobs";
    }
    console.error("Failed to load jobs for dashboard.", cause);
  }

  const statusValue = extractSingle(resolvedSearchParams?.status);
  const createdFromValue = extractSingle(resolvedSearchParams?.createdFrom);
  const createdToValue = extractSingle(resolvedSearchParams?.createdTo);
  const queueValue = extractSingle(resolvedSearchParams?.queue);
  const todayIso = new Date().toISOString().slice(0, 10);
  const queryBase = new URLSearchParams(params);
  queryBase.delete("after");
  queryBase.set("limit", String(limit));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-sm text-zinc-300">Primary queue view. Use Ops or Insights for secondary workflows.</p>
        <div className="flex items-center gap-2">
          <Link
            href="/ops"
            className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Open Ops
          </Link>
          <Link
            href="/insights"
            className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Open Insights
          </Link>
        </div>
      </section>
      <JobFilters
        status={statusValue}
        createdFrom={createdFromValue}
        createdTo={createdToValue}
        queue={queueValue}
        todayIso={todayIso}
      />
      {error ? (
        <div className="rounded-md border border-red-400/50 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      ) : null}
      <JobTable jobs={jobs} nextCursor={nextCursor} queryBase={queryBase.toString()} />
    </div>
  );
}

export default function Page({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-9 px-6 py-6 text-zinc-50">
      <Suspense
        fallback={
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
            Loading jobs...
          </div>
        }
      >
        <JobsSection searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
