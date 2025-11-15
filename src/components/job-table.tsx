import Link from "next/link";
import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/format";

interface Props {
  jobs: Job[];
}

export function JobTable({ jobs }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
        No jobs found. Adjust your filters or wait for new MakerWorks submissions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-4 py-3 font-medium text-zinc-600">MakerWorks ID</th>
            <th className="px-4 py-3 font-medium text-zinc-600">Payment Intent</th>
            <th className="px-4 py-3 font-medium text-zinc-600">Status</th>
            <th className="px-4 py-3 font-medium text-zinc-600">Total</th>
            <th className="px-4 py-3 font-medium text-zinc-600">Created</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-zinc-50">
              <td className="px-4 py-3 text-zinc-900">{job.id}</td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-700">
                {job.paymentIntentId}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                  {STATUS_LABELS[job.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-900">
                {formatCurrency(job.totalCents, job.currency)}
              </td>
              <td className="px-4 py-3 text-zinc-700">
                {formatDate(job.makerworksCreatedAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                  href={`/jobs/${encodeURIComponent(job.paymentIntentId)}`}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
