import Link from "next/link";
import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/format";
import { JobQueueControls } from "@/components/job-queue-controls";
import { SampleJobTestEmailButton } from "@/components/sample-job-test-email-button";

const SAMPLE_JOB_ID = "makerworks-sample-job";

interface Props {
  jobs: Job[];
}

export function JobTable({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-black/30 p-8 text-center text-sm text-zinc-300">
        No jobs found. Adjust your filters or wait for new MakerWorks submissions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#070707]/90 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm text-zinc-100">
        <thead className="bg-white/5 text-xs uppercase tracking-[0.25em] text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Queue</th>
            <th className="px-4 py-3 font-medium">MakerWorks ID</th>
            <th className="px-4 py-3 font-medium">Payment Intent</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {jobs.map((job, index) => (
            <tr key={job.id} className="transition hover:bg-white/5">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white/80">#{job.queuePosition}</span>
                  <JobQueueControls
                    paymentIntentId={job.paymentIntentId}
                    disableUp={index === 0}
                    disableDown={index === jobs.length - 1}
                  />
                </div>
              </td>
              <td className="px-4 py-4 text-white">{job.id}</td>
              <td className="px-4 py-4 font-mono text-xs text-zinc-400">
                {job.paymentIntentId}
              </td>
              <td className="px-4 py-4">
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                  {STATUS_LABELS[job.status]}
                </span>
              </td>
              <td className="px-4 py-4 text-white">
                {formatCurrency(job.totalCents, job.currency)}
              </td>
              <td className="px-4 py-4 text-zinc-400">
                {formatDate(job.makerworksCreatedAt)}
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex flex-col items-end gap-2">
                  {job.id === SAMPLE_JOB_ID && job.customerEmail ? (
                    <SampleJobTestEmailButton recipient={job.customerEmail} />
                  ) : null}
                  <Link
                    className="text-sm font-medium text-zinc-300 transition hover:text-white"
                    href={`/jobs/${encodeURIComponent(job.paymentIntentId)}`}
                  >
                    View
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
