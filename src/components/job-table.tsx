import Link from "next/link";
import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { deriveApproximatePrintTime } from "@/lib/print-time";
import { JobQueueControls } from "@/components/job-queue-controls";
import { SampleJobTestEmailButton } from "@/components/sample-job-test-email-button";
import { JobStatusQuickAction } from "@/components/job-status-quick-action";

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
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {jobs.map((job, index) => {
            const printTime = deriveApproximatePrintTime(job.metadata);
            return (
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
                <td className="px-4 py-4 text-white">
                  <div className="flex flex-col gap-1">
                    <span>{job.id}</span>
                    {printTime ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-amber-200/90">
                        approx.
                        <span className="text-sm font-semibold normal-case tracking-normal text-amber-100">
                          ~{printTime.formatted}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </td>
              <td className="px-4 py-4 font-mono text-xs text-zinc-400">
                {job.paymentIntentId}
              </td>
              <td className="px-4 py-4 text-white">
                {formatCurrency(job.totalCents, job.currency)}
              </td>
              <td className="px-4 py-4 text-zinc-400">
                {formatDate(job.makerworksCreatedAt)}
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex flex-col items-end gap-3">
                  {job.id === SAMPLE_JOB_ID && job.customerEmail ? (
                    <SampleJobTestEmailButton recipient={job.customerEmail} />
                  ) : null}
                  <Link
                    className="text-sm font-medium text-zinc-300 transition hover:text-white"
                    href={`/jobs/${encodeURIComponent(job.paymentIntentId)}`}
                  >
                    View
                  </Link>
                  <JobStatusQuickAction
                    paymentIntentId={job.paymentIntentId}
                    initialStatus={job.status}
                    className="w-full max-w-[180px]"
                  />
                </div>
              </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
