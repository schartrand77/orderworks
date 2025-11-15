import { Suspense } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { JobFilters } from "@/components/job-filters";
import { JobTable } from "@/components/job-table";

export const dynamic = "force-dynamic";

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

async function JobsSection({ searchParams }: { searchParams?: SearchParams }) {
  const params = toURLSearchParams(searchParams);
  let error: string | null = null;
  let statuses: JobStatus[] = [];
  let createdFrom: Date | undefined;
  let createdTo: Date | undefined;

  try {
    const filters = parseJobFilters(params);
    statuses = filters.statuses;
    createdFrom = filters.createdFrom;
    createdTo = filters.createdTo;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Invalid filters";
  }

  const jobs = await prisma.job.findMany({
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
    },
    orderBy: { makerworksCreatedAt: "desc" },
  });

  const statusValue = extractSingle(searchParams?.status);
  const createdFromValue = extractSingle(searchParams?.createdFrom);
  const createdToValue = extractSingle(searchParams?.createdTo);

  return (
    <div className="space-y-6">
      <JobFilters status={statusValue} createdFrom={createdFromValue} createdTo={createdToValue} />
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      <JobTable jobs={jobs} />
    </div>
  );
}

export default function Page({ searchParams }: { searchParams?: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-900">MakerWorks jobs</h1>
        <p className="text-sm text-zinc-600">
          Review incoming MakerWorks fabrication requests, track their status, and complete jobs once invoices are ready.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-zinc-600">Loading jobs…</div>}>
        <JobsSection searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
