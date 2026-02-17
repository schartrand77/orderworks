import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchMakerWorksStatus, CONNECTED_THRESHOLD_MINUTES } from "@/lib/makerworks-status";
import {
  getMakerWorksSyncTelemetry,
  makerWorksJobsTableExists,
  triggerMakerWorksSyncIfStale,
} from "@/lib/makerworks-sync";
import type { MakerWorksHealthPayload } from "@/types/makerworks-status";

export const dynamic = "force-dynamic";

async function gatherHealthPayload(): Promise<MakerWorksHealthPayload> {
  triggerMakerWorksSyncIfStale();
  const [statusPayload, orderworksTotal, makerworksTotal] = await Promise.all([
    fetchMakerWorksStatus(),
    prisma.job.count(),
    (async () => {
      const exists = await makerWorksJobsTableExists();
      if (!exists) {
        return 0;
      }
      const result = await prisma.$queryRaw<{ total: number }[]>(
        Prisma.sql`SELECT COUNT(*)::int AS total FROM public."jobs"`,
      );
      return result[0]?.total ?? 0;
    })(),
  ]);
  const telemetry = getMakerWorksSyncTelemetry();

  return {
    ...statusPayload,
    jobs: {
      orderworksTotal,
      makerworksTotal,
      lastMakerWorksUpdate: telemetry.lastSourceUpdatedAt
        ? telemetry.lastSourceUpdatedAt.toISOString()
        : null,
      lastSyncAt: telemetry.lastSuccessfulSyncAt ? telemetry.lastSuccessfulSyncAt.toISOString() : null,
      lastSyncDurationMs: telemetry.lastSyncDurationMs,
      lastSyncProcessed: telemetry.lastSyncProcessed,
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
        jobs: {
          orderworksTotal: 0,
          makerworksTotal: 0,
          lastMakerWorksUpdate: null,
          lastSyncAt: null,
        },
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
