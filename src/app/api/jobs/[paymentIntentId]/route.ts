import { NextRequest, NextResponse } from "next/server";
import type { Job, Prisma } from "@/generated/prisma/client";
import { JobStatus as JobStatusEnum, FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";
import { ensureAdminApiAuth } from "@/lib/auth";
import { sendReceiptEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { jobStatusUpdateSchema, normalizeJobStatusUpdatePayload } from "@/lib/validation";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";
import { updateMakerWorksFulfillmentStatus } from "@/lib/makerworks-writeback";

interface Params {
  paymentIntentId: string;
}

export async function GET(_request: NextRequest, context: { params: Promise<Params> }) {
  const unauthorized = ensureAdminApiAuth(_request);
  if (unauthorized) {
    return unauthorized;
  }
  const { paymentIntentId } = await context.params;
  await syncMakerWorksJobs();

  const job = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, context: { params: Promise<Params> }) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  const { paymentIntentId } = await context.params;
  await syncMakerWorksJobs();

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
  const nextStatus = normalized.status;
  const shouldSendReceipt =
    nextStatus !== undefined && nextStatus === JobStatusEnum.COMPLETED && existing.status !== JobStatusEnum.COMPLETED;

  if (shouldSendReceipt && !existing.customerEmail) {
    return NextResponse.json(
      { error: "Customer email is required before completing a job." },
      { status: 422 },
    );
  }

  const data: Prisma.JobUpdateInput = {
    ...(nextStatus !== undefined ? { status: nextStatus } : {}),
    ...(normalized.notes !== undefined ? { notes: normalized.notes } : {}),
    ...(normalized.lineItems !== undefined ? { lineItems: normalized.lineItems } : {}),
  };

  if (normalized.fulfillmentStatus !== undefined) {
    data.fulfillmentStatus = normalized.fulfillmentStatus;
    data.fulfilledAt =
      normalized.fulfillmentStatus === FulfillmentStatusEnum.SHIPPED ||
      normalized.fulfillmentStatus === FulfillmentStatusEnum.PICKED_UP
        ? new Date()
        : null;
  }

  const updated = await prisma.job.update({
    where: { paymentIntentId },
    data,
  });

  if (normalized.fulfillmentStatus !== undefined) {
    try {
      await updateMakerWorksFulfillmentStatus(paymentIntentId, normalized.fulfillmentStatus);
    } catch (error) {
      console.error("Failed to write fulfillment status back to MakerWorks:", error);
    }
  }

  if (shouldSendReceipt) {
    try {
      await sendReceiptEmail(updated as Job);
      const withReceiptTracking = await prisma.job.update({
        where: { paymentIntentId },
        data: {
          receiptSentAt: new Date(),
          receiptSendCount: { increment: 1 },
        },
      });
      return NextResponse.json({ job: withReceiptTracking });
    } catch (error) {
      await prisma.job.update({
        where: { paymentIntentId },
        data: {
          status: existing.status,
          notes: existing.notes,
          fulfillmentStatus: existing.fulfillmentStatus,
          fulfilledAt: existing.fulfilledAt,
        },
      });
      const message = error instanceof Error ? error.message : "Failed to send receipt email";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ job: updated });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<Params> }) {
  const unauthorized = ensureAdminApiAuth(_request);
  if (unauthorized) {
    return unauthorized;
  }
  const { paymentIntentId } = await context.params;
  await syncMakerWorksJobs();

  const existing = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.job.delete({ where: { id: existing.id } });
    if (typeof existing.queuePosition === "number") {
      await tx.job.updateMany({
        where: { queuePosition: { gt: existing.queuePosition } },
        data: { queuePosition: { decrement: 1 } },
      });
    }
  });

  return NextResponse.json({ deleted: true });
}
