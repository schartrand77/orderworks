import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MakerWorksStatusPayload, MakerWorksStatus } from "@/types/makerworks-status";

export const dynamic = "force-dynamic";

const CONNECTED_THRESHOLD_MINUTES = 15;

function buildResponse(data: MakerWorksStatusPayload, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function GET() {
  try {
    const latestJob = await prisma.job.findFirst({
      orderBy: { makerworksCreatedAt: "desc" },
      select: { makerworksCreatedAt: true },
    });

    const lastJobReceivedAt = latestJob?.makerworksCreatedAt ?? null;
    let status: MakerWorksStatus;

    if (!lastJobReceivedAt) {
      status = "waiting";
    } else {
      const ageMs = Date.now() - lastJobReceivedAt.getTime();
      const maxAgeMs = CONNECTED_THRESHOLD_MINUTES * 60 * 1000;
      status = ageMs <= maxAgeMs ? "connected" : "stale";
    }

    return buildResponse({
      connected: status === "connected",
      status,
      lastJobReceivedAt: lastJobReceivedAt?.toISOString() ?? null,
      thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return buildResponse(
      {
        connected: false,
        status: "error",
        lastJobReceivedAt: null,
        thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
        error: message,
      },
      { status: 500 },
    );
  }
}
