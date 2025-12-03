import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { JobStatus, WebhookEventStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { jobPayloadSchema, type JobPayload } from "@/lib/validation";
import { jsonOrNull } from "@/lib/json";

async function getNextQueuePosition() {
  const result = await prisma.job.aggregate({
    _max: { queuePosition: true },
  });
  return (result._max.queuePosition ?? 0) + 1;
}

function headersToRecord(headers: Headers) {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function normalizeSignature(signature: string) {
  return signature.replace(/^sha256=/i, "").trim().toLowerCase();
}

function computeSignature(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function signaturesMatch(expected: string, actual: string) {
  try {
    const normalizedExpected = Buffer.from(expected, "hex");
    const normalizedActual = Buffer.from(normalizeSignature(actual), "hex");
    if (normalizedExpected.length !== normalizedActual.length) {
      return false;
    }
    return timingSafeEqual(normalizedExpected, normalizedActual);
  } catch {
    return false;
  }
}

function extractReferenceIds(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { jobId: null as string | null, paymentIntentId: null as string | null };
  }
  const payload = body as Record<string, unknown>;
  return {
    jobId: typeof payload.id === "string" ? payload.id : null,
    paymentIntentId: typeof payload.paymentIntentId === "string" ? payload.paymentIntentId : null,
  };
}

function extractPaymentField(payload: JobPayload, key: "method" | "status") {
  const direct =
    key === "method"
      ? typeof payload.paymentMethod === "string" ? payload.paymentMethod : undefined
      : typeof payload.paymentStatus === "string" ? payload.paymentStatus : undefined;

  const nestedValue =
    payload.payment && typeof payload.payment[key] === "string" ? payload.payment[key] : undefined;

  const value = nestedValue ?? direct;
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function setWebhookEventStatus(eventId: string | null, status: WebhookEventStatus, error?: string) {
  if (!eventId) {
    return;
  }
  const truncatedError = error ? error.slice(0, 500) : null;
  await prisma.makerWorksWebhookEvent.update({
    where: { id: eventId },
    data: {
      status,
      error: truncatedError,
      processedAt: new Date(),
    },
  });
}

async function updateEventReferences(eventId: string | null, jobId: string, paymentIntentId: string) {
  if (!eventId) return;
  await prisma.makerWorksWebhookEvent.update({
    where: { id: eventId },
    data: {
      jobId,
      paymentIntentId,
    },
  });
}

const SIGNATURE_HEADER = "x-makerworks-signature";

export async function POST(request: NextRequest) {
  const { MAKERWORKS_WEBHOOK_SECRET } = getEnv();
  const header = request.headers.get("authorization");

  if (!header || !header.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid authorization header" }, { status: 401 });
  }

  const token = header.replace("Bearer", "").trim();
  if (token !== MAKERWORKS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing MakerWorks signature" }, { status: 401 });
  }

  const rawBody = await request.text();
  const expectedSignature = computeSignature(MAKERWORKS_WEBHOOK_SECRET, rawBody);
  if (!signaturesMatch(expectedSignature, signatureHeader)) {
    return NextResponse.json({ error: "Invalid MakerWorks signature" }, { status: 401 });
  }

  let parsedBody: unknown;
  let payloadForEvent: Prisma.InputJsonValue = rawBody as Prisma.InputJsonValue;
  try {
    parsedBody = rawBody.length > 0 ? JSON.parse(rawBody) : {};
    payloadForEvent = parsedBody as Prisma.InputJsonValue;
  } catch {
    parsedBody = null;
  }

  const { jobId, paymentIntentId } = extractReferenceIds(parsedBody ?? undefined);
  let eventId: string | null = null;
  try {
    const event = await prisma.makerWorksWebhookEvent.create({
      data: {
        jobId,
        paymentIntentId,
        signature: signatureHeader,
        payload: payloadForEvent,
        headers: headersToRecord(request.headers),
      },
      select: { id: true },
    });
    eventId = event.id;
  } catch {
    // If we can't persist the event we still want to continue processing the webhook.
  }

  if (parsedBody === null) {
    await setWebhookEventStatus(eventId, WebhookEventStatus.FAILED, "Invalid JSON payload");
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = jobPayloadSchema.safeParse(parsedBody);
  if (!parsed.success) {
    await setWebhookEventStatus(eventId, WebhookEventStatus.FAILED, "Validation failed");
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const payload = parsed.data;
  if (eventId) {
    await updateEventReferences(eventId, payload.id, payload.paymentIntentId);
  }
  const makerworksCreatedAt = payload.createdAt;
  const lineItems = payload.lineItems as Prisma.InputJsonValue;
  const shipping = jsonOrNull(payload.shipping);
  const metadata = jsonOrNull(payload.metadata);
  const paymentMethod = extractPaymentField(payload, "method");
  const paymentStatus = extractPaymentField(payload, "status");

  const existing = await prisma.job.findUnique({ where: { id: payload.id } });

  const queuedPosition = existing?.queuePosition ?? (await getNextQueuePosition());

  try {
    const job = await prisma.job.upsert({
      where: { id: payload.id },
      create: {
        id: payload.id,
        paymentIntentId: payload.paymentIntentId,
        totalCents: payload.totalCents,
        currency: payload.currency,
        lineItems,
        shipping,
        metadata,
        userId: payload.userId ?? null,
        customerEmail: payload.customerEmail ?? null,
        makerworksCreatedAt,
        queuePosition: queuedPosition,
        status: JobStatus.PENDING,
        paymentMethod,
        paymentStatus,
      },
      update: {
        paymentIntentId: payload.paymentIntentId,
        totalCents: payload.totalCents,
        currency: payload.currency,
        lineItems,
        shipping,
        metadata,
        userId: payload.userId ?? null,
        customerEmail: payload.customerEmail ?? null,
        makerworksCreatedAt,
        paymentMethod,
        paymentStatus,
      },
    });

    await setWebhookEventStatus(eventId, WebhookEventStatus.PROCESSED);
    return NextResponse.json({ job }, { status: existing ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to persist job";
    await setWebhookEventStatus(eventId, WebhookEventStatus.FAILED, message);
    return NextResponse.json({ error: "Unable to persist job" }, { status: 500 });
  }
}
