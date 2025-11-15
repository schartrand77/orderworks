import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/format";

interface Props {
  job: Job;
}

export function JobDetail({ job }: Props) {
  const lineItems = job.lineItems as unknown;
  const shipping = job.shipping as unknown;
  const metadata = job.metadata as unknown;

  return (
    <section className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Job summary</h2>
          <p className="text-sm text-zinc-600">{job.id}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
          {STATUS_LABELS[job.status]}
        </span>
      </header>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-700">Payment intent</dt>
          <dd className="font-mono text-xs text-zinc-700">{job.paymentIntentId}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700">Customer email</dt>
          <dd className="text-zinc-700">{job.customerEmail ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700">User ID</dt>
          <dd className="text-zinc-700">{job.userId ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700">Total</dt>
          <dd className="text-zinc-900">{formatCurrency(job.totalCents, job.currency)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700">MakerWorks created</dt>
          <dd className="text-zinc-700">{formatDate(job.makerworksCreatedAt)}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-700">Invoice URL</dt>
          <dd className="text-zinc-700">
            {job.invoiceUrl ? (
              <a
                className="text-blue-600 hover:text-blue-700"
                href={job.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View invoice
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-zinc-700">Notes</dt>
          <dd className="whitespace-pre-wrap text-zinc-700">{job.notes ?? "—"}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Line items</h3>
        <div className="space-y-3">
          {Array.isArray(lineItems) ? (
            lineItems.map((item, index) => (
              <pre
                key={index}
                className="overflow-x-auto rounded-md bg-zinc-900/5 p-3 text-xs text-zinc-800"
              >
                {JSON.stringify(item, null, 2)}
              </pre>
            ))
          ) : (
            <pre className="overflow-x-auto rounded-md bg-zinc-900/5 p-3 text-xs text-zinc-800">
              {JSON.stringify(lineItems, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Shipping</h3>
        <pre className="overflow-x-auto rounded-md bg-zinc-900/5 p-3 text-xs text-zinc-800">
          {shipping ? JSON.stringify(shipping, null, 2) : "null"}
        </pre>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-zinc-800">Metadata</h3>
        <pre className="overflow-x-auto rounded-md bg-zinc-900/5 p-3 text-xs text-zinc-800">
          {metadata ? JSON.stringify(metadata, null, 2) : "null"}
        </pre>
      </div>
    </section>
  );
}
