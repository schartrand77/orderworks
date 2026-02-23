import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ADMIN_SESSION_COOKIE, validateAdminSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchMakerWorksStatus, CONNECTED_THRESHOLD_MINUTES } from "@/lib/makerworks-status";
import {
  getMakerWorksSyncTelemetry,
  makerWorksJobsTableExists,
  triggerMakerWorksSyncIfStale,
} from "@/lib/makerworks-sync";
import type { MakerWorksHealthPayload } from "@/types/makerworks-status";

export const dynamic = "force-dynamic";

function isAdminSessionAuthorized(request: NextRequest) {
  return validateAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

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
  const telemetry = await getMakerWorksSyncTelemetry();

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

async function gatherPublicHealth() {
  const status = await fetchMakerWorksStatus();
  const ok = status.status !== "error";
  return {
    ok,
    status: ok ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  if (!isAdminSessionAuthorized(request)) {
    try {
      const payload = await gatherPublicHealth();
      return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          status: "degraded",
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
  }

  try {
    const payload = await gatherHealthPayload();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        connected: false,
        status: "error",
        lastJobReceivedAt: null,
        thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
        error: "Service check failed.",
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
    await gatherPublicHealth();
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
