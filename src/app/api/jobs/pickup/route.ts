import { NextRequest, NextResponse } from "next/server";
import { FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";
import { z } from "zod";
import { withAdminApiAuth } from "@/lib/auth";
import { recordJobAuditEvent } from "@/lib/job-audit";
import { dispatchJobTransitionWebhook } from "@/lib/outbound-webhooks";
import { prisma } from "@/lib/prisma";

const pickupPayloadSchema = z.object({
  code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = pickupPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
    }

    const code = parsed.data.code.trim();
    const job = await prisma.job.findFirst({
      where: {
        OR: [{ paymentIntentId: code }, { id: code }],
      },
    });

    if (!job) {
      return NextResponse.json({ error: "No matching job for this barcode/QR value." }, { status: 404 });
    }

    const previousStatus = job.status;
    const previousFulfillmentStatus = job.fulfillmentStatus;

    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        fulfillmentStatus: FulfillmentStatusEnum.PICKED_UP,
        fulfilledAt: new Date(),
        viewedAt: job.viewedAt ?? new Date(),
      },
    });

    await recordJobAuditEvent({
      jobId: updated.id,
      paymentIntentId: updated.paymentIntentId,
      eventType: "job_fulfillment_updated",
      actor: "pickup_scanner",
      details: { from: previousFulfillmentStatus, to: updated.fulfillmentStatus, scanCode: code },
    });

    void dispatchJobTransitionWebhook({
      jobId: updated.id,
      paymentIntentId: updated.paymentIntentId,
      previousStatus,
      nextStatus: updated.status,
      previousFulfillmentStatus,
      nextFulfillmentStatus: updated.fulfillmentStatus,
      source: "pickup_scan",
      actor: "pickup_scanner",
    });

    return NextResponse.json({ job: updated, pickedUp: true });
  });
}
