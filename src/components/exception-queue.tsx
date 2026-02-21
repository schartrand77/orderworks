import Link from "next/link";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { getJobExceptionLabel, type JobExceptionCode } from "@/lib/job-exceptions";

interface ExceptionItem {
  id: string;
  paymentIntentId: string;
  customerEmail: string | null;
  status: string;
  queuePosition: number;
  makerworksCreatedAt: Date;
  issues: JobExceptionCode[];
}

interface Props {
  items: ExceptionItem[];
}

export function ExceptionQueue({ items }: Props) {
  return (
    <section className="rounded-2xl border border-red-400/20 bg-red-500/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-red-100">Exception queue</h2>
        <Link href="/?queue=exceptions" className="text-xs font-medium text-red-200 hover:text-white">
          Open filtered view
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-300">No current exceptions detected.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">#{item.queuePosition}</span>
                <Link
                  href={`/jobs/${encodeURIComponent(item.paymentIntentId)}`}
                  className="text-sm text-red-100 hover:text-white"
                >
                  {item.customerEmail ?? item.paymentIntentId}
                </Link>
                <span className="text-xs text-zinc-400">
                  {STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ?? item.status}
                </span>
                <span className="text-xs text-zinc-400">{formatDate(item.makerworksCreatedAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.issues.map((issue) => (
                  <span
                    key={`${item.id}-${issue}`}
                    className="rounded-full border border-red-300/40 bg-red-500/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-red-100"
                  >
                    {getJobExceptionLabel(issue)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
