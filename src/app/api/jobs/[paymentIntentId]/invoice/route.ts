import { NextRequest, NextResponse } from "next/server";
import { withAdminApiAuth } from "@/lib/auth";
import { sendInvoiceEmail } from "@/lib/email";
import { hasOutstandingBalance } from "@/lib/job-display";
import { recordJobAuditEvent } from "@/lib/job-audit";
import { prisma } from "@/lib/prisma";

interface Params {
  paymentIntentId: string;
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  return withAdminApiAuth(request, async () => {
    const { paymentIntentId } = await context.params;

    const job = await prisma.job.findUnique({
      where: { paymentIntentId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job.customerEmail) {
      return NextResponse.json({ error: "Customer email is required to send an invoice." }, { status: 422 });
    }

    if (!hasOutstandingBalance(job)) {
      return NextResponse.json({ error: "This job is already marked paid." }, { status: 422 });
    }

    try {
      await sendInvoiceEmail(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send invoice email";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const updated = await prisma.job.update({
      where: { paymentIntentId },
      data: {
        invoiceSentAt: new Date(),
        invoiceSendCount: { increment: 1 },
      },
    });
    await recordJobAuditEvent({
      jobId: updated.id,
      paymentIntentId,
      eventType: "invoice_sent",
      actor: "admin",
      details: { recipient: updated.customerEmail },
    });

    return NextResponse.json({ job: updated, sent: true });
  });
}
