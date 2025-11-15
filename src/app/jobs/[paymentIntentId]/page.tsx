import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JobDetail } from "@/components/job-detail";
import { JobStatusForm } from "@/components/job-status-form";

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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/">
        �+? Back to jobs
      </Link>
      <JobDetail job={job} />
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Update job status</h2>
          <p className="text-sm text-zinc-600">
            Set the job to pending, printing, or completed. When a job is completed, a receipt is emailed to the
            customer.
          </p>
        </div>
        <JobStatusForm
          paymentIntentId={job.paymentIntentId}
          currentStatus={job.status}
          defaultInvoiceUrl={job.invoiceUrl}
          defaultNotes={job.notes}
          customerEmail={job.customerEmail}
        />
      </section>
    </main>
  );
}
