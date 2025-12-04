import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JobDeleteButton } from "@/components/job-delete-button";
import { JobDetail } from "@/components/job-detail";
import { JobStatusForm } from "@/components/job-status-form";
import { TestEmailForm } from "@/components/test-email-form";

interface PageProps {
  params: Promise<{ paymentIntentId: string }>;
}

export default async function JobDetailPage({ params }: PageProps) {
  const resolvedParams = await params;
  const paymentIntentId = decodeURIComponent(resolvedParams.paymentIntentId);
  const job = await prisma.job.findUnique({ where: { paymentIntentId } });

  if (!job) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10 text-zinc-50">
      <Link className="text-sm font-medium text-zinc-300 transition hover:text-white" href="/">
        Back to jobs
      </Link>
      <JobDetail job={job} />
      <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <div>
          <h2 className="text-lg font-semibold text-white">Update job status</h2>
          <p className="text-sm text-zinc-400">
            Set the job to pending, printing, or completed. When a job is completed, a receipt is emailed to the
            customer.
          </p>
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
