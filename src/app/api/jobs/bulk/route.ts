import { NextRequest, NextResponse } from "next/server";
import { FulfillmentStatus as FulfillmentStatusEnum, JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { z } from "zod";
import { withAdminApiAuth } from "@/lib/auth";
import { sendInvoiceEmail } from "@/lib/email";
import { hasOutstandingBalance } from "@/lib/job-display";
import { recordJobAuditEvent } from "@/lib/job-audit";
import { dispatchJobTransitionWebhook } from "@/lib/outbound-webhooks";
import { prisma } from "@/lib/prisma";

const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    paymentIntentIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(["pending", "printing", "completed"]),
  }),
  z.object({
    action: z.literal("set_fulfillment"),
    paymentIntentIds: z.array(z.string().min(1)).min(1).max(200),
    fulfillmentStatus: z.enum(["pending", "ready", "shipped", "picked_up"]),
  }),
  z.object({
    action: z.literal("send_invoices"),
    paymentIntentIds: z.array(z.string().min(1)).min(1).max(200),
  }),
  z.object({
    action: z.literal("mark_viewed"),
    paymentIntentIds: z.array(z.string().min(1)).min(1).max(200),
  }),
]);

function toJobStatus(value: "pending" | "printing" | "completed") {
  if (value === "pending") {
    return JobStatusEnum.PENDING;
  }
  if (value === "printing") {
    return JobStatusEnum.PRINTING;
  }
  return JobStatusEnum.COMPLETED;
}

function toFulfillmentStatus(value: "pending" | "ready" | "shipped" | "picked_up") {
  if (value === "ready") {
    return FulfillmentStatusEnum.READY;
  }
  if (value === "shipped") {
    return FulfillmentStatusEnum.SHIPPED;
  }
  if (value === "picked_up") {
    return FulfillmentStatusEnum.PICKED_UP;
  }
  return FulfillmentStatusEnum.PENDING;
}

export async function POST(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = bulkActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const payload = parsed.data;
    const paymentIntentIds = Array.from(new Set(payload.paymentIntentIds));

    if (payload.action === "set_status") {
      const status = toJobStatus(payload.status);
      const jobs = await prisma.job.findMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
        select: { id: true, paymentIntentId: true, status: true, fulfillmentStatus: true },
      });
      const result = await prisma.job.updateMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
        data: { status },
      });
      for (const job of jobs) {
        if (job.status === status) {
          continue;
        }
        await recordJobAuditEvent({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          eventType: "bulk_status_updated",
          actor: "admin",
          details: { from: job.status, to: status },
        });
        void dispatchJobTransitionWebhook({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          previousStatus: job.status,
          nextStatus: status,
          previousFulfillmentStatus: job.fulfillmentStatus,
          nextFulfillmentStatus: job.fulfillmentStatus,
          source: "bulk_set_status",
          actor: "admin",
        });
      }
      return NextResponse.json({ updated: result.count, action: payload.action });
    }

    if (payload.action === "set_fulfillment") {
      const fulfillmentStatus = toFulfillmentStatus(payload.fulfillmentStatus);
      const jobs = await prisma.job.findMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
        select: { id: true, paymentIntentId: true, fulfillmentStatus: true, status: true },
      });
      const fulfilledAt =
        fulfillmentStatus === FulfillmentStatusEnum.SHIPPED ||
        fulfillmentStatus === FulfillmentStatusEnum.PICKED_UP
          ? new Date()
          : null;
      const result = await prisma.job.updateMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
        data: { fulfillmentStatus, fulfilledAt },
      });
      for (const job of jobs) {
        if (job.fulfillmentStatus === fulfillmentStatus) {
          continue;
        }
        await recordJobAuditEvent({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          eventType: "bulk_fulfillment_updated",
          actor: "admin",
          details: { from: job.fulfillmentStatus, to: fulfillmentStatus },
        });
        void dispatchJobTransitionWebhook({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          previousStatus: job.status,
          nextStatus: job.status,
          previousFulfillmentStatus: job.fulfillmentStatus,
          nextFulfillmentStatus: fulfillmentStatus,
          source: "bulk_set_fulfillment",
          actor: "admin",
        });
      }
      return NextResponse.json({ updated: result.count, action: payload.action });
    }

    if (payload.action === "mark_viewed") {
      const jobsToMark = await prisma.job.findMany({
        where: {
          paymentIntentId: { in: paymentIntentIds },
          viewedAt: null,
        },
        select: { id: true, paymentIntentId: true },
      });
      const result = await prisma.job.updateMany({
        where: {
          paymentIntentId: { in: paymentIntentIds },
          viewedAt: null,
        },
        data: { viewedAt: new Date() },
      });
      for (const job of jobsToMark) {
        await recordJobAuditEvent({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          eventType: "bulk_mark_viewed",
          actor: "admin",
        });
      }
      return NextResponse.json({ updated: result.count, action: payload.action });
    }

    const jobs = await prisma.job.findMany({
      where: {
        paymentIntentId: { in: paymentIntentIds },
      },
    });

    let sent = 0;
    let skipped = 0;
    const failed: Array<{ paymentIntentId: string; error: string }> = [];

    for (const job of jobs) {
      if (!job.customerEmail || !hasOutstandingBalance(job)) {
        skipped += 1;
        continue;
      }

      try {
        await sendInvoiceEmail(job);
        await prisma.job.update({
          where: { paymentIntentId: job.paymentIntentId },
          data: {
            invoiceSentAt: new Date(),
            invoiceSendCount: { increment: 1 },
          },
        });
        await recordJobAuditEvent({
          jobId: job.id,
          paymentIntentId: job.paymentIntentId,
          eventType: "bulk_invoice_sent",
          actor: "admin",
          details: { recipient: job.customerEmail },
        });
        sent += 1;
      } catch (error) {
        failed.push({
          paymentIntentId: job.paymentIntentId,
          error: error instanceof Error ? error.message : "Unable to send invoice",
        });
      }
    }

    return NextResponse.json({
      action: payload.action,
      total: jobs.length,
      sent,
      skipped,
      failed,
    });
  });
}
