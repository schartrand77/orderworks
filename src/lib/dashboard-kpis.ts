import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { deriveApproximatePrintTime } from "@/lib/print-time";

export interface SlaThresholds {
  warningHours: number;
  breachHours: number;
}

export interface SlaMetrics {
  openJobs: number;
  warningJobs: number;
  breachedJobs: number;
  oldestAgeHours: number;
}

export interface CapacityForecast {
  printers: number;
  consideredJobs: number;
  jobsWithEstimate: number;
  unknownEstimateJobs: number;
  totalEstimatedMinutes: number;
  frontQueueMinutes: number;
  tailQueueMinutes: number;
  estimatedClearAt: Date | null;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseSlaThresholds(warningInput?: string, breachInput?: string): SlaThresholds {
  const envWarning = parsePositiveInt(process.env.SLA_WARNING_HOURS, 24);
  const envBreach = parsePositiveInt(process.env.SLA_BREACH_HOURS, 72);
  const warningHours = parsePositiveInt(warningInput, envWarning);
  const breachHours = Math.max(parsePositiveInt(breachInput, envBreach), warningHours + 1);
  return { warningHours, breachHours };
}

export function parseCapacityPrinters(value?: string) {
  return parsePositiveInt(value, parsePositiveInt(process.env.CAPACITY_PRINTER_COUNT, 2));
}

export async function loadSlaMetrics(thresholds: SlaThresholds): Promise<SlaMetrics> {
  const openJobs = await prisma.job.findMany({
    where: {
      status: {
        in: [JobStatusEnum.PENDING, JobStatusEnum.PRINTING],
      },
    },
    select: {
      makerworksCreatedAt: true,
    },
    take: 800,
    orderBy: { makerworksCreatedAt: "asc" },
  });

  const nowMs = Date.now();
  let warningJobs = 0;
  let breachedJobs = 0;
  let oldestAgeHours = 0;

  for (const job of openJobs) {
    const ageHours = Math.max(0, (nowMs - job.makerworksCreatedAt.getTime()) / (60 * 60 * 1000));
    oldestAgeHours = Math.max(oldestAgeHours, ageHours);
    if (ageHours >= thresholds.breachHours) {
      breachedJobs += 1;
    } else if (ageHours >= thresholds.warningHours) {
      warningJobs += 1;
    }
  }

  return {
    openJobs: openJobs.length,
    warningJobs,
    breachedJobs,
    oldestAgeHours: Math.round(oldestAgeHours * 10) / 10,
  };
}

export async function loadCapacityForecast(printers: number): Promise<CapacityForecast> {
  const rows = await prisma.job.findMany({
    where: {
      status: {
        in: [JobStatusEnum.PENDING, JobStatusEnum.PRINTING],
      },
    },
    orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
    take: 250,
    select: {
      metadata: true,
    },
  });

  let totalEstimatedMinutes = 0;
  let jobsWithEstimate = 0;
  let frontQueueMinutes = 0;

  rows.forEach((row, index) => {
    const estimate = deriveApproximatePrintTime(row.metadata);
    if (!estimate?.minutes || estimate.minutes <= 0) {
      return;
    }
    jobsWithEstimate += 1;
    totalEstimatedMinutes += estimate.minutes;
    if (index < 10) {
      frontQueueMinutes += estimate.minutes;
    }
  });

  const unknownEstimateJobs = rows.length - jobsWithEstimate;
  const estimatedHours = totalEstimatedMinutes > 0 ? totalEstimatedMinutes / 60 / printers : 0;
  const estimatedClearAt =
    estimatedHours > 0 ? new Date(Date.now() + Math.round(estimatedHours * 60 * 60 * 1000)) : null;

  return {
    printers,
    consideredJobs: rows.length,
    jobsWithEstimate,
    unknownEstimateJobs,
    totalEstimatedMinutes,
    frontQueueMinutes,
    tailQueueMinutes: Math.max(0, totalEstimatedMinutes - frontQueueMinutes),
    estimatedClearAt,
  };
}
