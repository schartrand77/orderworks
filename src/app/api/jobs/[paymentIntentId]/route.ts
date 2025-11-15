import { NextRequest, NextResponse } from "next/server";
import type { Job } from "@/generated/prisma/client";
import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { sendReceiptEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { jobStatusUpdateSchema, normalizeJobStatusUpdatePayload } from "@/lib/validation";

interface Params {
  paymentIntentId: string;
}

export async function GET(_request: NextRequest, context: { params: Promise<Params> }) {
  const { paymentIntentId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, context: { params: Promise<Params> }) {
  const { paymentIntentId } = await context.params;

  const existing = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = jobStatusUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const normalized = normalizeJobStatusUpdatePayload(parsed.data);
  const shouldSendReceipt =
    normalized.status === JobStatusEnum.COMPLETED && existing.status !== JobStatusEnum.COMPLETED;

  if (shouldSendReceipt && !existing.customerEmail) {
    return NextResponse.json(
      { error: "Customer email is required before completing a job." },
      { status: 422 },
    );
  }

  const updated = await prisma.job.update({
    where: { paymentIntentId },
    data: {
      status: normalized.status,
      ...(normalized.invoiceUrl !== undefined ? { invoiceUrl: normalized.invoiceUrl } : {}),
      ...(normalized.notes !== undefined ? { notes: normalized.notes } : {}),
    },
  });

  if (shouldSendReceipt) {
    try {
      await sendReceiptEmail(updated as Job);
    } catch (error) {
      await prisma.job.update({
        where: { paymentIntentId },
        data: {
          status: existing.status,
          invoiceUrl: existing.invoiceUrl,
          notes: existing.notes,
        },
      });
      const message = error instanceof Error ? error.message : "Failed to send receipt email";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ job: updated });
}
