import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ensureAdminApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface Params {
  paymentIntentId: string;
}

type Direction = "up" | "down";

function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function POST(request: NextRequest, context: { params: Promise<Params> }) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }
  const startedAt = Date.now();
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
  const targetIndexRaw = (body as { targetIndex?: unknown }).targetIndex;

  const orderedJobs = await prisma.job.findMany({
    orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
    select: { id: true, queuePosition: true, paymentIntentId: true },
  });

  const currentIndex = orderedJobs.findIndex((entry) => entry.id === job.id);
  if (currentIndex < 0) {
    return NextResponse.json({ error: "Job not found in queue" }, { status: 404 });
  }

  let targetIndex: number | null = null;
  if (typeof targetIndexRaw === "number" && Number.isInteger(targetIndexRaw)) {
    targetIndex = clamp(targetIndexRaw, 0, Math.max(orderedJobs.length - 1, 0));
  } else if (isDirection(direction)) {
    if (direction === "up") {
      targetIndex = Math.max(currentIndex - 1, 0);
    } else {
      targetIndex = Math.min(currentIndex + 1, orderedJobs.length - 1);
    }
  }

  if (targetIndex === null) {
    return NextResponse.json({ error: "Provide either a valid targetIndex or direction ('up'|'down')." }, { status: 422 });
  }

  if (targetIndex === currentIndex) {
    return NextResponse.json({ job }, { status: 200 });
  }

  const from = Math.min(currentIndex, targetIndex);
  const to = Math.max(currentIndex, targetIndex);
  const segment = orderedJobs.slice(from, to + 1);
  const queuePositions = segment.map((entry) => entry.queuePosition);
  const segmentIds = segment.map((entry) => entry.id);

  const movedId = orderedJobs[currentIndex]?.id;
  if (!movedId) {
    return NextResponse.json({ error: "Unable to reorder job" }, { status: 500 });
  }

  const reorderedIds = segmentIds.filter((id) => id !== movedId);
  reorderedIds.splice(targetIndex - from, 0, movedId);
  const assignments = reorderedIds.map((id, index) => ({ id, queuePosition: queuePositions[index] ?? 0 }));

  await prisma.$transaction(async (tx) => {
    const whenClauses = assignments.map(({ id, queuePosition }) => Prisma.sql`WHEN ${id} THEN ${queuePosition}`);
    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "jobs"
        SET "queue_position" = CASE "id"
          ${Prisma.join(whenClauses, " ")}
          ELSE "queue_position"
        END
        WHERE "id" IN (${Prisma.join(assignments.map(({ id }) => id))})
      `,
    );
  });

  const updatedJob = await prisma.job.findUnique({
    where: { id: job.id },
  });
  console.info(
    `[api/jobs/queue] paymentIntentId=${paymentIntentId} from=${currentIndex} to=${targetIndex} durationMs=${Date.now() - startedAt}`,
  );

  return NextResponse.json({ job: updatedJob ?? job });
}
