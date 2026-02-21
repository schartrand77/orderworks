import { NextRequest, NextResponse } from "next/server";
import type { Job, Prisma } from "@/generated/prisma/client";
import { JobStatus as JobStatusEnum, FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";
import { withAdminApiAuth } from "@/lib/auth";
import { sendReceiptEmail } from "@/lib/email";
import { getRequestId, logStructured } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { jobStatusUpdateSchema, normalizeJobStatusUpdatePayload } from "@/lib/validation";
import { updateMakerWorksFulfillmentStatus } from "@/lib/makerworks-writeback";
import { recordJobAuditEvent } from "@/lib/job-audit";
import { dispatchJobTransitionWebhook } from "@/lib/outbound-webhooks";

interface Params {
  paymentIntentId: string;
}

export async function GET(_request: NextRequest, context: { params: Promise<Params> }) {
  return withAdminApiAuth(_request, async () => {
    const { paymentIntentId } = await context.params;

    const job = await prisma.job.findUnique({
      where: { paymentIntentId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<Params> }) {
  const requestId = getRequestId(request);
  const route = "/api/jobs/[paymentIntentId]";
  return withAdminApiAuth(request, async () => {
    const startedAt = Date.now();
    const { paymentIntentId } = await context.params;

    const existing = await prisma.job.findUnique({
      where: { paymentIntentId },
    });

    if (!existing) {
      logStructured("warn", "job_update_not_found", {
        requestId,
        route,
        durationMs: Date.now() - startedAt,
        paymentIntentId,
      });
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
      nextStatus !== undefined &&
      nextStatus === JobStatusEnum.COMPLETED &&
      existing.status !== JobStatusEnum.COMPLETED;

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

    if (shouldSendReceipt) {
      const emailJob: Job = {
        ...existing,
        status: nextStatus ?? existing.status,
        notes: normalized.notes !== undefined ? normalized.notes : existing.notes,
        lineItems:
          (normalized.lineItems !== undefined ? normalized.lineItems : existing.lineItems) as Job["lineItems"],
        fulfillmentStatus: normalized.fulfillmentStatus ?? existing.fulfillmentStatus,
        fulfilledAt:
          normalized.fulfillmentStatus !== undefined
            ? normalized.fulfillmentStatus === FulfillmentStatusEnum.SHIPPED ||
              normalized.fulfillmentStatus === FulfillmentStatusEnum.PICKED_UP
              ? new Date()
              : null
            : existing.fulfilledAt,
      };

      try {
        await sendReceiptEmail(emailJob);
        const withReceiptTracking = await prisma.job.update({
          where: { paymentIntentId },
          data: {
            ...data,
            receiptSentAt: new Date(),
            receiptSendCount: { increment: 1 },
          },
        });
        if (normalized.fulfillmentStatus !== undefined) {
          try {
            await updateMakerWorksFulfillmentStatus(paymentIntentId, normalized.fulfillmentStatus);
          } catch (error) {
            console.error("Failed to write fulfillment status back to MakerWorks:", error);
          }
        }
        logStructured("info", "job_updated_with_receipt", {
          requestId,
          route,
          durationMs: Date.now() - startedAt,
          jobId: withReceiptTracking.id,
          paymentIntentId,
        });
        if (existing.status !== withReceiptTracking.status) {
          await recordJobAuditEvent({
            jobId: withReceiptTracking.id,
            paymentIntentId,
            eventType: "job_status_updated",
            actor: "admin",
            details: { from: existing.status, to: withReceiptTracking.status },
          });
        }
        if ((existing.notes ?? "") !== (withReceiptTracking.notes ?? "")) {
          await recordJobAuditEvent({
            jobId: withReceiptTracking.id,
            paymentIntentId,
            eventType: "job_notes_updated",
            actor: "admin",
          });
        }
        if (existing.fulfillmentStatus !== withReceiptTracking.fulfillmentStatus) {
          await recordJobAuditEvent({
            jobId: withReceiptTracking.id,
            paymentIntentId,
            eventType: "job_fulfillment_updated",
            actor: "admin",
            details: { from: existing.fulfillmentStatus, to: withReceiptTracking.fulfillmentStatus },
          });
        }
        await recordJobAuditEvent({
          jobId: withReceiptTracking.id,
          paymentIntentId,
          eventType: "receipt_sent",
          actor: "admin",
          details: { recipient: withReceiptTracking.customerEmail },
        });
        void dispatchJobTransitionWebhook({
          jobId: withReceiptTracking.id,
          paymentIntentId,
          previousStatus: existing.status,
          nextStatus: withReceiptTracking.status,
          previousFulfillmentStatus: existing.fulfillmentStatus,
          nextFulfillmentStatus: withReceiptTracking.fulfillmentStatus,
          source: "job_patch",
          actor: "admin",
        });
        return NextResponse.json({ job: withReceiptTracking });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send receipt email";
        logStructured("error", "job_receipt_send_failed", {
          requestId,
          route,
          durationMs: Date.now() - startedAt,
          paymentIntentId,
        });
        return NextResponse.json({ error: message }, { status: 500 });
      }
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

    logStructured("info", "job_updated", {
      requestId,
      route,
      durationMs: Date.now() - startedAt,
      jobId: updated.id,
      paymentIntentId,
    });
    if (existing.status !== updated.status) {
      await recordJobAuditEvent({
        jobId: updated.id,
        paymentIntentId,
        eventType: "job_status_updated",
        actor: "admin",
        details: { from: existing.status, to: updated.status },
      });
    }
    if ((existing.notes ?? "") !== (updated.notes ?? "")) {
      await recordJobAuditEvent({
        jobId: updated.id,
        paymentIntentId,
        eventType: "job_notes_updated",
        actor: "admin",
      });
    }
    if (existing.fulfillmentStatus !== updated.fulfillmentStatus) {
      await recordJobAuditEvent({
        jobId: updated.id,
        paymentIntentId,
        eventType: "job_fulfillment_updated",
        actor: "admin",
        details: { from: existing.fulfillmentStatus, to: updated.fulfillmentStatus },
      });
    }
    void dispatchJobTransitionWebhook({
      jobId: updated.id,
      paymentIntentId,
      previousStatus: existing.status,
      nextStatus: updated.status,
      previousFulfillmentStatus: existing.fulfillmentStatus,
      nextFulfillmentStatus: updated.fulfillmentStatus,
      source: "job_patch",
      actor: "admin",
    });
    return NextResponse.json({ job: updated });
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<Params> }) {
  const requestId = getRequestId(_request);
  const route = "/api/jobs/[paymentIntentId]";
  return withAdminApiAuth(_request, async () => {
    const startedAt = Date.now();
    const { paymentIntentId } = await context.params;

    const existing = await prisma.job.findUnique({
      where: { paymentIntentId },
    });

    if (!existing) {
      logStructured("warn", "job_delete_not_found", {
        requestId,
        route,
        durationMs: Date.now() - startedAt,
        paymentIntentId,
      });
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

    logStructured("info", "job_deleted", {
      requestId,
      route,
      durationMs: Date.now() - startedAt,
      jobId: existing.id,
      paymentIntentId,
    });
    await recordJobAuditEvent({
      jobId: existing.id,
      paymentIntentId,
      eventType: "job_deleted",
      actor: "admin",
    });
    return NextResponse.json({ deleted: true });
  });
}
