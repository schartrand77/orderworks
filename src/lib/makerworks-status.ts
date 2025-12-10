import { prisma } from "@/lib/prisma";
import type { MakerWorksStatusPayload } from "@/types/makerworks-status";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";

export const CONNECTED_THRESHOLD_MINUTES = 15;

export async function fetchMakerWorksStatus(): Promise<MakerWorksStatusPayload> {
  await syncMakerWorksJobs();
  const latestJob = await prisma.job.findFirst({
    orderBy: { makerworksCreatedAt: "desc" },
    select: { makerworksCreatedAt: true },
  });

  const lastJobReceivedAt = latestJob?.makerworksCreatedAt ?? null;
  let status: MakerWorksStatusPayload["status"];

  if (!lastJobReceivedAt) {
    status = "waiting";
  } else {
    const ageMs = Date.now() - lastJobReceivedAt.getTime();
    const maxAgeMs = CONNECTED_THRESHOLD_MINUTES * 60 * 1000;
    status = ageMs <= maxAgeMs ? "connected" : "stale";
  }

  return {
    connected: status === "connected",
    status,
    lastJobReceivedAt: lastJobReceivedAt?.toISOString() ?? null,
    thresholdMinutes: CONNECTED_THRESHOLD_MINUTES,
  };
}
