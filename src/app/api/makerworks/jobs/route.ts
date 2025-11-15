import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { jobPayloadSchema } from "@/lib/validation";

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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = jobPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  }

  const payload = parsed.data;
  const makerworksCreatedAt = payload.createdAt;
  const lineItems = payload.lineItems as Prisma.InputJsonValue;
  const shipping = (payload.shipping ?? null) as Prisma.InputJsonValue | null;
  const metadata = (payload.metadata ?? null) as Prisma.InputJsonValue | null;

  const existing = await prisma.job.findUnique({ where: { id: payload.id } });

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
      status: "new",
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
    },
  });

  return NextResponse.json({ job }, { status: existing ? 200 : 201 });
}
