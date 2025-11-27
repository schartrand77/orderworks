import { NextResponse } from "next/server";
import { WebhookEventStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { fetchMakerWorksStatus, CONNECTED_THRESHOLD_MINUTES } from "@/lib/makerworks-status";
import type { MakerWorksHealthPayload } from "@/types/makerworks-status";

export const dynamic = "force-dynamic";

async function gatherHealthPayload(): Promise<MakerWorksHealthPayload> {
  const [statusPayload, groupedEvents, lastEvent, totalJobs] = await Promise.all([
    fetchMakerWorksStatus(),
    prisma.makerWorksWebhookEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.makerWorksWebhookEvent.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.job.count(),
  ]);

  const eventsSummary = groupedEvents.reduce(
    (acc, { status, _count }) => {
      const count = _count._all;
      acc.total += count;
      if (status === WebhookEventStatus.RECEIVED) {
        acc.received = count;
      } else if (status === WebhookEventStatus.PROCESSED) {
        acc.processed = count;
      } else if (status === WebhookEventStatus.FAILED) {
        acc.failed = count;
      }
      return acc;
    },
    { total: 0, received: 0, processed: 0, failed: 0 },
  );

  return {
    ...statusPayload,
    events: {
      ...eventsSummary,
      lastEventAt: lastEvent?.createdAt?.toISOString() ?? null,
    },
    jobs: {
      total: totalJobs,
    },
    appUptimeSeconds: Math.round(process.uptime()),
  };
}

export async function GET() {
  try {
    const payload = await gatherHealthPayload();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        connected: false,
        status: "error",
        lastJobReceivedAt: null,
        thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
        error: message,
        events: {
          total: 0,
          received: 0,
          processed: 0,
          failed: 0,
          lastEventAt: null,
        },
        jobs: { total: 0 },
        appUptimeSeconds: Math.round(process.uptime()),
      },
      { status: 500 },
    );
  }
}

export async function HEAD() {
  try {
    await gatherHealthPayload();
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
