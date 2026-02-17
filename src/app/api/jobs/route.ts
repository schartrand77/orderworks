import { NextRequest, NextResponse } from "next/server";
import { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import { ensureAdminApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJobFilters } from "@/lib/job-query";
import { manualJobSchema } from "@/lib/validation";
import { jsonOrNull } from "@/lib/json";
import { getNextQueuePosition } from "@/lib/job-queue";
import { triggerMakerWorksSyncIfStale } from "@/lib/makerworks-sync";

const DEFAULT_PAGE_SIZE = 75;
const MAX_PAGE_SIZE = 100;

function parsePageSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseCursor(value: string | null) {
  if (!value) {
    return null;
  }
  const [queuePositionText, ...idParts] = value.split(":");
  const queuePosition = Number.parseInt(queuePositionText ?? "", 10);
  const id = idParts.join(":");
  if (!Number.isFinite(queuePosition) || !id) {
    return null;
  }
  return { queuePosition, id };
}

function encodeCursor(queuePosition: number, id: string) {
  return `${queuePosition}:${id}`;
}

export async function GET(request: NextRequest) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const startedAt = Date.now();
    triggerMakerWorksSyncIfStale();
    const filters = parseJobFilters(request.nextUrl.searchParams);
    const limit = parsePageSize(request.nextUrl.searchParams.get("limit"));
    const cursor = parseCursor(request.nextUrl.searchParams.get("after"));

    const rows = await prisma.job.findMany({
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
        ...(cursor
          ? {
              OR: [
                { queuePosition: { gt: cursor.queuePosition } },
                { queuePosition: cursor.queuePosition, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
      take: limit + 1,
      select: {
        id: true,
        paymentIntentId: true,
        queuePosition: true,
        viewedAt: true,
        status: true,
        totalCents: true,
        currency: true,
        makerworksCreatedAt: true,
        customerEmail: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    let nextCursor: string | null = null;
    const jobs = rows.slice(0, limit);
    if (rows.length > limit) {
      const last = jobs[jobs.length - 1];
      if (last) {
        nextCursor = encodeCursor(last.queuePosition, last.id);
      }
    }

    console.info(`[api/jobs] method=GET durationMs=${Date.now() - startedAt} count=${jobs.length}`);
    return NextResponse.json({ jobs, nextCursor });
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
        : payload.fulfillmentStatus === "ready"
          ? FulfillmentStatus.READY
          : FulfillmentStatus.PENDING;
  const fulfilledAt =
    fulfillmentStatus === FulfillmentStatus.SHIPPED || fulfillmentStatus === FulfillmentStatus.PICKED_UP
      ? new Date()
      : null;

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
