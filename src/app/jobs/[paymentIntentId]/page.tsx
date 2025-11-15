import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JobDetail } from "@/components/job-detail";
import { CompleteJobForm } from "@/components/complete-job-form";

interface PageProps {
  params: { paymentIntentId: string };
}

export default async function JobDetailPage({ params }: PageProps) {
  const paymentIntentId = decodeURIComponent(params.paymentIntentId);
  const job = await prisma.job.findUnique({ where: { paymentIntentId } });

  if (!job) {
    notFound();
  }

  const isDone = job.status === "done";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href="/">
        ← Back to jobs
      </Link>
      <JobDetail job={job} />
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Complete this job</h2>
          <p className="text-sm text-zinc-600">
            Provide a final invoice link and optional notes. Completing the job will lock its status as done.
          </p>
        </div>
        <CompleteJobForm
          paymentIntentId={job.paymentIntentId}
          defaultInvoiceUrl={job.invoiceUrl}
          defaultNotes={job.notes}
          disabled={isDone}
        />
      </section>
    </main>
  );
}
