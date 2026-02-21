import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import type { Job } from "@/generated/prisma/client";
import { extractModelFiles } from "@/lib/model-files";

export type JobExceptionCode =
  | "payment_mismatch"
  | "missing_model_files"
  | "failed_email_notifications";

interface JobExceptionInput {
  status: string;
  customerEmail: string | null;
  paymentStatus: string | null;
  metadata: Job["metadata"];
  lineItems: Job["lineItems"];
  notes: string | null;
  receiptSentAt: Date | null;
  updatedAt: Date;
}

export function classifyJobExceptions(job: JobExceptionInput): JobExceptionCode[] {
  const issues: JobExceptionCode[] = [];

  if (job.status === JobStatusEnum.COMPLETED && hasOutstandingBalance(job.paymentStatus)) {
    issues.push("payment_mismatch");
  }

  const modelFiles = extractModelFiles({
    metadata: job.metadata,
    lineItems: job.lineItems,
    notes: job.notes,
  });
  if (modelFiles.length === 0) {
    issues.push("missing_model_files");
  }

  // Completed jobs with email but no receipt long after completion are likely notification failures.
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  if (
    job.status === JobStatusEnum.COMPLETED &&
    !!job.customerEmail &&
    !job.receiptSentAt &&
    job.updatedAt.getTime() < fifteenMinutesAgo
  ) {
    issues.push("failed_email_notifications");
  }

  return issues;
}

function hasOutstandingBalance(paymentStatus: string | null) {
  const rawStatus = paymentStatus?.trim();
  if (!rawStatus) {
    return true;
  }

  const normalized = rawStatus.toLowerCase();
  const paidKeywords = ["paid", "succeeded", "success", "captured", "complete", "completed", "settled"];
  return !paidKeywords.some((keyword) => normalized.includes(keyword));
}

export function getJobExceptionLabel(code: JobExceptionCode) {
  switch (code) {
    case "payment_mismatch":
      return "Payment mismatch";
    case "missing_model_files":
      return "Missing model files";
    case "failed_email_notifications":
      return "Failed email notifications";
    default:
      return code;
  }
}
