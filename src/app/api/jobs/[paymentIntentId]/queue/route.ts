import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  paymentIntentId: string;
}

type Direction = "up" | "down";

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down";
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  const { paymentIntentId } = await context.params;

  const job = await prisma.job.findUnique({
    where: { paymentIntentId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const direction = (body as { direction?: string }).direction;

  if (!isDirection(direction)) {
    return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 422 });
  }

  const neighbor = await prisma.job.findFirst({
    where:
      direction === "up"
        ? { queuePosition: { lt: job.queuePosition } }
        : { queuePosition: { gt: job.queuePosition } },
    orderBy: { queuePosition: direction === "up" ? "desc" : "asc" },
  });

  if (!neighbor) {
    return NextResponse.json({ job }, { status: 200 });
  }

  const [updatedJob] = await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { queuePosition: neighbor.queuePosition },
    }),
    prisma.job.update({
      where: { id: neighbor.id },
      data: { queuePosition: job.queuePosition },
    }),
  ]);

  return NextResponse.json({ job: updatedJob });
}
