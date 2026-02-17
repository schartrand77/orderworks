import { JobTableClient, type SerializedJob } from "@/components/job-table-client";
import type { JobStatus } from "@/generated/prisma/enums";

interface Props {
  jobs: {
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
  }[];
  nextCursor?: string | null;
  queryBase?: string;
}

export function JobTable({ jobs, nextCursor, queryBase }: Props) {
  const serialized: SerializedJob[] = jobs.map((job) => ({
    id: job.id,
    paymentIntentId: job.paymentIntentId,
    queuePosition: job.queuePosition,
    viewedAt: job.viewedAt ? job.viewedAt.toISOString() : null,
    status: job.status,
    totalCents: job.totalCents,
    currency: job.currency,
    makerworksCreatedAt: job.makerworksCreatedAt.toISOString(),
    customerEmail: job.customerEmail,
    paymentMethod: job.paymentMethod,
    paymentStatus: job.paymentStatus,
  }));

  return <JobTableClient jobs={serialized} nextCursor={nextCursor ?? null} queryBase={queryBase} />;
}
