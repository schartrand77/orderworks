import { Suspense } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";
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

async function JobsSection({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const params = toURLSearchParams(resolvedSearchParams);
  let error: string | null = null;
  let statuses: JobStatus[] = [];
  let createdFrom: Date | undefined;
  let createdTo: Date | undefined;
  let jobs = [] as Awaited<ReturnType<typeof prisma.job.findMany>>;

  try {
    const filters = parseJobFilters(params);
    statuses = filters.statuses;
    createdFrom = filters.createdFrom;
    createdTo = filters.createdTo;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Invalid filters";
  }

  try {
    await syncMakerWorksJobs();

    jobs = await prisma.job.findMany({
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
      orderBy: [
        { makerworksCreatedAt: "desc" },
        { queuePosition: "asc" },
      ],
    });
  } catch (cause) {
    if (!error) {
      error = cause instanceof Error ? cause.message : "Unable to load jobs";
    }
    console.error("Failed to load jobs for dashboard.", cause);
  }

  const statusValue = extractSingle(resolvedSearchParams?.status);
  const createdFromValue = extractSingle(resolvedSearchParams?.createdFrom);
  const createdToValue = extractSingle(resolvedSearchParams?.createdTo);

  return (
    <div className="space-y-6">
      <JobFilters status={statusValue} createdFrom={createdFromValue} createdTo={createdToValue} />
      {error ? (
        <div className="rounded-md border border-red-400/50 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      ) : null}
      <JobTable jobs={jobs} />
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
