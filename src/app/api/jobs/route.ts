import { NextRequest, NextResponse } from "next/server";
import { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import { ensureAdminApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { manualJobSchema } from "@/lib/validation";
import { jsonOrNull } from "@/lib/json";
import { getNextQueuePosition } from "@/lib/job-queue";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";

export async function GET(request: NextRequest) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    await syncMakerWorksJobs();
    const filters = parseJobFilters(request.nextUrl.searchParams);

    const jobs = await prisma.job.findMany({
      where: {
        ...(filters.statuses.length > 0 ? { status: { in: filters.statuses } } : {}),
        ...(filters.createdFrom || filters.createdTo
          ? {
              makerworksCreatedAt: {
                ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
                ...(filters.createdTo ? { lte: filters.createdTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { makerworksCreatedAt: "desc" },
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

function buildFallbackLineItem(jobId: string, totalCents: number) {
  return [
    {
      description: `Manual entry for ${jobId}`,
      quantity: 1,
      unitPriceCents: totalCents,
    },
  ];
}

export async function POST(request: NextRequest) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  await syncMakerWorksJobs();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = manualJobSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 });
  }

  const payload = parsed.data;
  const id = payload.id.trim();
  const paymentIntentId = payload.paymentIntentId.trim();
  const totalCents = payload.totalCents;
  const currency = payload.currency.trim().toLowerCase();
  const makerworksCreatedAt = payload.makerworksCreatedAt ?? new Date();

  const existing = await prisma.job.findFirst({
    where: {
      OR: [{ id }, { paymentIntentId }],
    },
    select: { id: true, paymentIntentId: true },
  });

  if (existing) {
    const conflictField = existing.id === id ? "id" : "paymentIntentId";
    return NextResponse.json({ error: `Job with that ${conflictField} already exists.` }, { status: 409 });
  }

  const normalizedCustomerEmail = payload.customerEmail?.trim();
  const normalizedUserId = payload.userId?.trim();
  const normalizedNotes = payload.notes?.trim();
  const normalizedPaymentMethod = payload.paymentMethod?.trim();
  const normalizedPaymentStatus = payload.paymentStatus?.trim();
  const metadata = jsonOrNull(payload.metadata);
  const shipping = jsonOrNull(payload.shipping);
  const queuePosition = await getNextQueuePosition();
  const lineItems =
    payload.lineItems && payload.lineItems.length > 0 ? payload.lineItems : buildFallbackLineItem(id, totalCents);
  const fulfillmentStatus =
    payload.fulfillmentStatus === "shipped"
      ? FulfillmentStatus.SHIPPED
      : payload.fulfillmentStatus === "picked_up"
        ? FulfillmentStatus.PICKED_UP
        : FulfillmentStatus.PENDING;
  const fulfilledAt = fulfillmentStatus === FulfillmentStatus.PENDING ? null : new Date();

  try {
    const job = await prisma.job.create({
      data: {
        id,
        paymentIntentId,
        totalCents,
        currency,
        lineItems,
        ...(shipping !== undefined ? { shipping } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        userId: normalizedUserId && normalizedUserId.length > 0 ? normalizedUserId : null,
        customerEmail: normalizedCustomerEmail && normalizedCustomerEmail.length > 0 ? normalizedCustomerEmail : null,
        makerworksCreatedAt,
        makerworksUpdatedAt: makerworksCreatedAt,
        queuePosition,
        status: JobStatus.PENDING,
        notes: normalizedNotes && normalizedNotes.length > 0 ? normalizedNotes : null,
        paymentMethod:
          normalizedPaymentMethod && normalizedPaymentMethod.length > 0 ? normalizedPaymentMethod : null,
        paymentStatus:
          normalizedPaymentStatus && normalizedPaymentStatus.length > 0 ? normalizedPaymentStatus : null,
        fulfillmentStatus,
        fulfilledAt,
      },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Failed to create manual job:", error);
    return NextResponse.json({ error: "Unable to create job" }, { status: 500 });
  }
}
