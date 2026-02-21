import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_ARCHIVE_BATCH_SIZE = 500;
const DEFAULT_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_SUMMARY_REFRESH_INTERVAL_MS = 60 * 1000;

let maintenanceInFlight: Promise<void> | null = null;
let lastMaintenanceAt = 0;
let lastSummaryRefreshAt = 0;

type DashboardSummaryRow = {
  singletonKey: string;
  generatedAt: Date;
  totalJobs: number;
  pendingJobs: number;
  printingJobs: number;
  completedJobs: number;
  readyJobs: number;
  shippedJobs: number;
  pickedUpJobs: number;
  unviewedJobs: number;
  agingOver1d: number;
  agingOver3d: number;
  agingOver7d: number;
  archivedTotal: number;
};

function extractDbErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function isMissingDatabaseObject(error: unknown) {
  const code = extractDbErrorCode(error);
  return code === "42883" || code === "42P01";
}

function retentionDays() {
  const value = Number.parseInt(process.env.JOB_RETENTION_DAYS ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  return value;
}

function archiveBatchSize() {
  const value = Number.parseInt(process.env.JOB_ARCHIVE_BATCH_SIZE ?? "", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_ARCHIVE_BATCH_SIZE;
  }
  return value;
}

export async function archiveCompletedJobs() {
  const days = retentionDays();
  const batch = archiveBatchSize();
  try {
    const result = await prisma.$queryRaw<{ archived: number }[]>(
      Prisma.sql`SELECT orderworks."archive_completed_jobs"(${days}::integer, ${batch}::integer)::int AS archived`,
    );
    return result[0]?.archived ?? 0;
  } catch (error) {
    if (isMissingDatabaseObject(error)) {
      console.warn("Archive function/table not available yet; skipping archive run.");
      return 0;
    }
    throw error;
  }
}

export async function refreshDashboardSummary() {
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT orderworks."refresh_job_dashboard_summary"()`);
    lastSummaryRefreshAt = Date.now();
    return true;
  } catch (error) {
    if (isMissingDatabaseObject(error)) {
      console.warn("Dashboard summary view/function not available yet; skipping refresh.");
      return false;
    }
    throw error;
  }
}

export async function triggerMaintenanceIfDue(maxAgeMs = DEFAULT_MAINTENANCE_INTERVAL_MS) {
  const now = Date.now();
  if (maintenanceInFlight) {
    return false;
  }
  if (now - lastMaintenanceAt < maxAgeMs) {
    return false;
  }

  maintenanceInFlight = (async () => {
    try {
      let archivedTotal = 0;
      for (let i = 0; i < 20; i += 1) {
        const archived = await archiveCompletedJobs();
        archivedTotal += archived;
        if (archived === 0) {
          break;
        }
      }
      await refreshDashboardSummary();
      if (archivedTotal > 0) {
        console.info(`[job-maintenance] archived=${archivedTotal}`);
      }
    } catch (error) {
      console.error("Job maintenance failed.", error);
    } finally {
      lastMaintenanceAt = Date.now();
      maintenanceInFlight = null;
    }
  })();

  return true;
}

export async function triggerSummaryRefreshIfStale(maxAgeMs = DEFAULT_SUMMARY_REFRESH_INTERVAL_MS) {
  if (Date.now() - lastSummaryRefreshAt < maxAgeMs) {
    return false;
  }
  try {
    await refreshDashboardSummary();
    return true;
  } catch (error) {
    console.error("Dashboard summary refresh failed.", error);
    return false;
  }
}

export async function getDashboardSummary() {
  try {
    const rows = await prisma.$queryRaw<DashboardSummaryRow[]>(
      Prisma.sql`
        SELECT
          "singleton_key" AS "singletonKey",
          "generated_at" AS "generatedAt",
          "total_jobs" AS "totalJobs",
          "pending_jobs" AS "pendingJobs",
          "printing_jobs" AS "printingJobs",
          "completed_jobs" AS "completedJobs",
          "ready_jobs" AS "readyJobs",
          "shipped_jobs" AS "shippedJobs",
          "picked_up_jobs" AS "pickedUpJobs",
          "unviewed_jobs" AS "unviewedJobs",
          "aging_over_1d" AS "agingOver1d",
          "aging_over_3d" AS "agingOver3d",
          "aging_over_7d" AS "agingOver7d",
          "archived_total" AS "archivedTotal"
        FROM "job_dashboard_summary"
        WHERE "singleton_key" = 'default'
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  } catch (error) {
    console.warn("Unable to read dashboard summary.", error);
    return null;
  }
}
