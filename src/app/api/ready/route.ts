import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getMakerWorksSyncTelemetry, makerWorksJobsTableExists } from "@/lib/makerworks-sync";

const SYNC_LAG_THRESHOLD_SECONDS = Number.parseInt(process.env.SYNC_LAG_ALERT_SECONDS ?? "900", 10);
const CONSECUTIVE_SYNC_FAILURES_THRESHOLD = Number.parseInt(process.env.SYNC_FAILURES_ALERT_COUNT ?? "3", 10);
const SLOW_QUERY_COUNT_THRESHOLD = Number.parseInt(process.env.SLOW_QUERY_ALERT_COUNT ?? "25", 10);

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {
    db: { ok: false },
    source: { ok: false },
  };
  const alerts: string[] = [];

  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    checks.db = { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "DB connectivity failed";
    checks.db = { ok: false, detail };
  }

  let sourceLatest: Date | null = null;
  try {
    const sourceTableExists = await makerWorksJobsTableExists();
    if (!sourceTableExists) {
      checks.source = { ok: false, detail: "MakerWorks source table public.jobs is missing." };
    } else {
      const rows = await prisma.$queryRaw<{ sourceLatest: Date | null }[]>(
        Prisma.sql`SELECT MAX("updatedAt") AS "sourceLatest" FROM public."jobs"`,
      );
      sourceLatest = rows[0]?.sourceLatest ?? null;
      checks.source = { ok: true };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Source readiness check failed";
    checks.source = { ok: false, detail };
  }

  const telemetry = await getMakerWorksSyncTelemetry();
  if (telemetry.consecutiveFailures >= CONSECUTIVE_SYNC_FAILURES_THRESHOLD) {
    alerts.push(
      `consecutive sync failures ${telemetry.consecutiveFailures} >= ${CONSECUTIVE_SYNC_FAILURES_THRESHOLD}`,
    );
  }
  if (telemetry.lastSlowQueryCount >= SLOW_QUERY_COUNT_THRESHOLD) {
    alerts.push(`slow query count ${telemetry.lastSlowQueryCount} >= ${SLOW_QUERY_COUNT_THRESHOLD}`);
  }
  if (sourceLatest && telemetry.lastSourceUpdatedAt) {
    const lagSeconds = Math.max(
      0,
      Math.floor((sourceLatest.getTime() - telemetry.lastSourceUpdatedAt.getTime()) / 1000),
    );
    if (lagSeconds >= SYNC_LAG_THRESHOLD_SECONDS) {
      alerts.push(`sync lag ${lagSeconds}s >= ${SYNC_LAG_THRESHOLD_SECONDS}s`);
    }
  }

  const ready = checks.db.ok && checks.source.ok;
  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "not_ready",
      checks,
      alerts,
      telemetry: {
        lastSourceUpdatedAt: telemetry.lastSourceUpdatedAt?.toISOString() ?? null,
        lastSuccessfulSyncAt: telemetry.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastSyncDurationMs: telemetry.lastSyncDurationMs,
        lastSyncProcessed: telemetry.lastSyncProcessed,
        consecutiveFailures: telemetry.consecutiveFailures,
        lastSlowQueryCount: telemetry.lastSlowQueryCount,
        slowQueryCountTotal: telemetry.slowQueryCountTotal,
      },
      threshold: {
        syncLagSeconds: SYNC_LAG_THRESHOLD_SECONDS,
        consecutiveSyncFailures: CONSECUTIVE_SYNC_FAILURES_THRESHOLD,
        slowQueryCount: SLOW_QUERY_COUNT_THRESHOLD,
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
