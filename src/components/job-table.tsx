import type { Job } from "@/generated/prisma/client";
import { JobTableClient, type SerializedJob } from "@/components/job-table-client";

interface Props {
  jobs: Job[];
}

export function JobTable({ jobs }: Props) {
  const serialized: SerializedJob[] = jobs.map((job) => ({
    id: job.id,
    paymentIntentId: job.paymentIntentId,
    queuePosition: job.queuePosition,
    viewedAt: job.viewedAt ? job.viewedAt.toISOString() : null,
    metadata: job.metadata,
    shipping: job.shipping,
    status: job.status,
    totalCents: job.totalCents,
    currency: job.currency,
    makerworksCreatedAt: job.makerworksCreatedAt.toISOString(),
    customerEmail: job.customerEmail,
    paymentMethod: job.paymentMethod,
    paymentStatus: job.paymentStatus,
  }));

  return <JobTableClient jobs={serialized} />;
}
