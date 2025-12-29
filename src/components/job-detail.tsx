import Image from "next/image";
import type { Job } from "@/generated/prisma/client";
import { FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";
import { formatCurrency, formatDate, FULFILLMENT_STATUS_LABELS } from "@/lib/format";
import { deriveApproximatePrintTime } from "@/lib/print-time";
import { buildBambuStudioLink, extractModelFiles } from "@/lib/model-files";
import { getCustomerName, getPaymentMethodLabel } from "@/lib/job-display";
import { JobStatusBadge } from "@/components/job-status-badge";

interface Props {
  job: Job;
}

export function JobDetail({ job }: Props) {
  const lineItems = job.lineItems as unknown;
  const shipping = job.shipping as unknown;
  const metadata = job.metadata as unknown;
  const printTime = deriveApproximatePrintTime(job.metadata);
  const modelFiles = extractModelFiles(job);
  const paymentMethodLabel = humanize(job.paymentMethod);
  const paymentStatusLabel = humanize(job.paymentStatus);
  const paymentSummary =
    paymentMethodLabel || paymentStatusLabel
      ? [paymentMethodLabel, paymentStatusLabel].filter(Boolean).join(" • ")
      : null;
  const fulfillmentLabel = FULFILLMENT_STATUS_LABELS[job.fulfillmentStatus];
  const fulfilledTimestamp =
    job.fulfilledAt && job.fulfillmentStatus !== FulfillmentStatusEnum.PENDING
      ? formatDate(job.fulfilledAt)
      : null;

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
        <JobStatusBadge status={job.status} />
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
          <dt className="font-medium text-zinc-400">Payment type</dt>
          <dd className="text-white">{getPaymentMethodLabel(job)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">Payment</dt>
          <dd className="text-white">
            {paymentSummary ? (
              <span className="inline-flex items-center gap-2">
                {paymentMethodLabel ? <span>{paymentMethodLabel}</span> : null}
                {paymentStatusLabel ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${
                      paymentStatusLabel.toLowerCase() === "paid"
                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-400/40 bg-amber-500/10 text-amber-100"
                    }`}
                  >
                    {paymentStatusLabel}
                  </span>
                ) : null}
              </span>
            ) : (
              "Not provided"
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-400">Customer</dt>
          <dd className="text-white">{getCustomerName(job) ?? "Not provided"}</dd>
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
          <dt className="font-medium text-zinc-400">Fulfillment</dt>
          <dd className="text-white">
            <div>{fulfillmentLabel}</div>
            {job.fulfillmentStatus === FulfillmentStatusEnum.PENDING ? (
              <p className="text-xs text-zinc-500">Not yet shipped or picked up.</p>
            ) : fulfilledTimestamp ? (
              <p className="text-xs text-zinc-400">Updated {fulfilledTimestamp}</p>
            ) : null}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-zinc-400">Notes</dt>
          <dd className="whitespace-pre-wrap text-white">{job.notes ?? "No additional notes"}</dd>
        </div>
      </dl>
      {modelFiles.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Model files</h3>
          <div className="space-y-3">
            {modelFiles.map((file) => (
              <div
                key={file.url}
                className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{file.label}</p>
                  <p className="truncate text-xs text-zinc-400" title={file.url}>
                    {file.url}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                  >
                    Download
                  </a>
                  <a
                    href={buildBambuStudioLink(file.url)}
                    className="rounded-md bg-gradient-to-r from-[#62f1ff] to-[#4ca0ff] px-3 py-1.5 text-xs font-semibold text-[#050505] shadow-[0_15px_40px_rgba(0,0,0,0.55)] transition hover:brightness-110"
                  >
                    Send to slicer
                  </a>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Bambu Studio opens on the computer you&apos;re using right now (the link is handled by your browser via{" "}
            <code className="mx-1 rounded bg-black/40 px-1 py-0.5 text-[0.6rem] text-white">bambu-studio://</code>). No
            tooling runs inside the OrderWorks container—approve any connection prompt that appears in your local slicer.
          </p>
        </div>
      ) : null}
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

function humanize(value?: string | null) {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
