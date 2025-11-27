import Image from "next/image";
import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/format";
import { deriveApproximatePrintTime } from "@/lib/print-time";

interface Props {
  job: Job;
}

export function JobDetail({ job }: Props) {
  const lineItems = job.lineItems as unknown;
  const shipping = job.shipping as unknown;
  const metadata = job.metadata as unknown;
  const printTime = deriveApproximatePrintTime(job.metadata);

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#070707]/90 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Image
          src="/makerworks-letterhead.svg"
          alt="MakerWorks letterhead"
          width={1600}
          height={360}
          className="h-auto w-full"
          priority
        />
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Job summary</h2>
          <p className="text-sm text-zinc-400">{job.id}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-100">
          {STATUS_LABELS[job.status]}
        </span>
      </header>
      <dl className="grid gap-4 text-sm text-zinc-200 sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-400">Queue position</dt>
          <dd className="text-white">#{job.queuePosition}</dd>
        </div>
        {printTime ? (
          <div>
            <dt className="font-medium text-zinc-400">Approximate print time</dt>
            <dd className="text-white">~{printTime.formatted}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-medium text-zinc-400">Payment intent</dt>
          <dd className="font-mono text-xs text-zinc-300">{job.paymentIntentId}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">Customer email</dt>
          <dd className="text-white">{job.customerEmail ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">User ID</dt>
          <dd className="text-white">{job.userId ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">Total</dt>
          <dd className="text-white">{formatCurrency(job.totalCents, job.currency)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">MakerWorks created</dt>
          <dd className="text-white">{formatDate(job.makerworksCreatedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">Invoice URL</dt>
          <dd className="text-white">
            {job.invoiceUrl ? (
              <a
                className="text-zinc-200 underline decoration-white/30 underline-offset-4 transition hover:text-white hover:decoration-white/60"
                href={job.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View invoice
              </a>
            ) : (
              "Not provided"
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-zinc-400">Notes</dt>
          <dd className="whitespace-pre-wrap text-white">{job.notes ?? "No additional notes"}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Line items</h3>
        <div className="space-y-3">
          {Array.isArray(lineItems) ? (
            lineItems.map((item, index) => (
              <pre
                key={index}
                className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-200"
              >
                {JSON.stringify(item, null, 2)}
              </pre>
            ))
          ) : (
            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-200">
              {JSON.stringify(lineItems, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Shipping</h3>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-200">
          {shipping ? JSON.stringify(shipping, null, 2) : "null"}
        </pre>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-300">Metadata</h3>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-zinc-200">
          {metadata ? JSON.stringify(metadata, null, 2) : "null"}
        </pre>
      </div>
    </section>
  );
}
