import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { triggerMakerWorksSyncIfStale } from "@/lib/makerworks-sync";
import { JobDeleteButton } from "@/components/job-delete-button";
import { JobDetail } from "@/components/job-detail";
import { JobLineItemsEditor } from "@/components/job-line-items-editor";
import { JobStatusForm } from "@/components/job-status-form";
import { SendInvoiceButton } from "@/components/send-invoice-button";
import { TestEmailForm } from "@/components/test-email-form";
import { hasOutstandingBalance } from "@/lib/job-display";
import { formatDate } from "@/lib/format";

interface PageProps {
  params: Promise<{ paymentIntentId: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const paymentIntentId = decodeURIComponent(resolvedParams.paymentIntentId);
  triggerMakerWorksSyncIfStale();
  const job = await prisma.job.findUnique({ where: { paymentIntentId } });

  if (!job) {
    notFound();
  }

  await prisma.job.updateMany({
    where: { paymentIntentId, viewedAt: null },
    data: { viewedAt: new Date() },
  });
  const outstandingBalance = hasOutstandingBalance(job);
  const canSendInvoice = outstandingBalance && Boolean(job.customerEmail);
  const receiptStatus = job.receiptSentAt
    ? `Receipt already sent ${formatDate(job.receiptSentAt)}${job.receiptSendCount > 1 ? ` (${job.receiptSendCount} total)` : ""}.`
    : "Receipt has not been sent yet.";
  const invoiceStatus = job.invoiceSentAt
    ? `Invoice already sent ${formatDate(job.invoiceSentAt)}${job.invoiceSendCount > 1 ? ` (${job.invoiceSendCount} total)` : ""}.`
    : "Invoice has not been sent yet.";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 text-zinc-50">
      <Link className="text-sm font-medium text-zinc-300 transition hover:text-white" href="/">
        Back to jobs
      </Link>
      <JobDetail job={job} />
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div>
          <h2 className="text-lg font-semibold text-white">Edit line items</h2>
          <p className="text-sm text-zinc-400">
            Use this when a customer needs a correction (like a missing color or material). Changes are stored in
            OrderWorks.
          </p>
        </div>
        <JobLineItemsEditor paymentIntentId={job.paymentIntentId} lineItems={job.lineItems} />
      </section>
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div>
          <h2 className="text-lg font-semibold text-white">Billing + status</h2>
          <p className="text-sm text-zinc-400">
            Set the job to pending, printing, or completed. When a job is completed, a receipt is emailed to the
            customer.
          </p>
        </div>
        <div className="space-y-2 rounded-xl border border-dashed border-white/20 bg-black/30 p-4">
          <p className="text-xs text-zinc-400">{receiptStatus}</p>
          <p className="text-xs text-zinc-400">{invoiceStatus}</p>
          <p className="text-sm text-zinc-200">
            Outstanding payment:{" "}
            <span className={outstandingBalance ? "text-amber-200" : "text-emerald-200"}>
              {outstandingBalance ? "Yes" : "No"}
            </span>
          </p>
          <p className="text-xs text-zinc-400">
            {canSendInvoice
              ? `Send an invoice reminder to ${job.customerEmail}.`
              : job.customerEmail
                ? "Invoice sending is disabled because this job is already marked paid."
                : "Invoice sending is disabled because this job has no customer email."}
          </p>
          <div>
            <SendInvoiceButton
              paymentIntentId={job.paymentIntentId}
              customerEmail={job.customerEmail}
              disabled={!canSendInvoice}
            />
          </div>
        </div>
        <JobStatusForm
          paymentIntentId={job.paymentIntentId}
          currentStatus={job.status}
          defaultNotes={job.notes}
          customerEmail={job.customerEmail}
          currentFulfillmentStatus={job.fulfillmentStatus}
          fulfilledAt={job.fulfilledAt ? job.fulfilledAt.toISOString() : null}
        />
        <TestEmailForm defaultRecipient={job.customerEmail} />
      </section>
      <section className="space-y-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Delete job</h2>
          <p className="text-sm text-red-100/80">
            Permanently remove this job from the queue and database. This action cannot be undone.
          </p>
        </div>
        <JobDeleteButton paymentIntentId={job.paymentIntentId} jobId={job.id} />
      </section>
    </main>
  );
}
