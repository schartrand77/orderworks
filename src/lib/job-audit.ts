import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type JobAuditEventType =
  | "job_created"
  | "job_deleted"
  | "job_status_updated"
  | "job_notes_updated"
  | "job_fulfillment_updated"
  | "job_viewed"
  | "invoice_sent"
  | "receipt_sent"
  | "bulk_status_updated"
  | "bulk_fulfillment_updated"
  | "bulk_mark_viewed"
  | "bulk_invoice_sent";

interface RecordJobAuditEventInput {
  jobId: string;
  paymentIntentId: string;
  eventType: JobAuditEventType;
  actor?: string | null;
  details?: Record<string, unknown>;
}

export interface JobAuditEvent {
  id: string;
  jobId: string;
  paymentIntentId: string;
  eventType: JobAuditEventType;
  actor: string | null;
  details: unknown;
  createdAt: Date;
}

function isMissingAuditTable(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "42P01";
}

export async function recordJobAuditEvent(input: RecordJobAuditEventInput) {
  const client = prisma as unknown as { $executeRaw?: (...args: unknown[]) => Promise<unknown> };
  if (typeof client.$executeRaw !== "function") {
    return;
  }

  try {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "job_audit_events" (
          "job_id",
          "payment_intent_id",
          "event_type",
          "actor",
          "details"
        )
        VALUES (
          ${input.jobId},
          ${input.paymentIntentId},
          ${input.eventType},
          ${input.actor ?? null},
          ${JSON.stringify(input.details ?? {})}::jsonb
        )
      `,
    );
  } catch (error) {
    if (isMissingAuditTable(error)) {
      return;
    }
    console.warn("Unable to write job audit event.", error);
  }
}

export async function listJobAuditEvents(paymentIntentId: string, limit = 100): Promise<JobAuditEvent[]> {
  try {
    return await prisma.$queryRaw<JobAuditEvent[]>(
      Prisma.sql`
        SELECT
          "id"::text AS "id",
          "job_id" AS "jobId",
          "payment_intent_id" AS "paymentIntentId",
          "event_type" AS "eventType",
          "actor",
          "details",
          "created_at" AS "createdAt"
        FROM "job_audit_events"
        WHERE "payment_intent_id" = ${paymentIntentId}
        ORDER BY "created_at" DESC
        LIMIT ${limit}
      `,
    );
  } catch (error) {
    if (isMissingAuditTable(error)) {
      return [];
    }
    console.warn("Unable to read job audit events.", error);
    return [];
  }
}

export function getAuditEventLabel(eventType: JobAuditEventType) {
  switch (eventType) {
    case "job_created":
      return "Job created";
    case "job_deleted":
      return "Job deleted";
    case "job_status_updated":
      return "Status updated";
    case "job_notes_updated":
      return "Notes updated";
    case "job_fulfillment_updated":
      return "Fulfillment updated";
    case "job_viewed":
      return "Marked viewed";
    case "invoice_sent":
      return "Invoice sent";
    case "receipt_sent":
      return "Receipt sent";
    case "bulk_status_updated":
      return "Bulk status update";
    case "bulk_fulfillment_updated":
      return "Bulk fulfillment update";
    case "bulk_mark_viewed":
      return "Bulk mark viewed";
    case "bulk_invoice_sent":
      return "Bulk invoice sent";
    default:
      return eventType;
  }
}
