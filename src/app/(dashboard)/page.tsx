import { Suspense } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { triggerMakerWorksSyncIfStale } from "@/lib/makerworks-sync";
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
        ...(cursor
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
      take: limit + 1,
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
      },
    });

    if (rows.length > limit) {
      const next = rows[limit - 1];
      if (next) {
        nextCursor = encodeCursor(next.queuePosition, next.id);
      }
      jobs = rows.slice(0, limit);
    } else {
      jobs = rows;
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
  const queryBase = new URLSearchParams(params);
  queryBase.delete("after");
  queryBase.set("limit", String(limit));

  return (
    <div className="space-y-6">
      <JobFilters status={statusValue} createdFrom={createdFromValue} createdTo={createdToValue} />
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
