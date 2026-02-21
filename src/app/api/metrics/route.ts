import { NextRequest, NextResponse } from "next/server";
import { withAdminApiAuth } from "@/lib/auth";
import { getInternalMetricsPayload } from "@/lib/internal-metrics";
import { getMakerWorksSyncTelemetry } from "@/lib/makerworks-sync";
import { getDashboardSummary, triggerSummaryRefreshIfStale } from "@/lib/job-maintenance";

export async function GET(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    void triggerSummaryRefreshIfStale();
    const [metrics, syncTelemetry, dashboardSummary] = await Promise.all([
      getInternalMetricsPayload(),
      getMakerWorksSyncTelemetry(),
      getDashboardSummary(),
    ]);

    return NextResponse.json({
      ...metrics,
      syncTelemetry: {
        lastSourceUpdatedAt: syncTelemetry.lastSourceUpdatedAt?.toISOString() ?? null,
        lastSuccessfulSyncAt: syncTelemetry.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastSyncDurationMs: syncTelemetry.lastSyncDurationMs,
        lastSyncProcessed: syncTelemetry.lastSyncProcessed,
        consecutiveFailures: syncTelemetry.consecutiveFailures,
        slowQueryCountTotal: syncTelemetry.slowQueryCountTotal,
      },
      dashboardSummary,
    });
  });
}
