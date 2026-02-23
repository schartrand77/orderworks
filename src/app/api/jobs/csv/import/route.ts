import { NextRequest, NextResponse } from "next/server";
import { FulfillmentStatus as FulfillmentStatusEnum, JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { withAdminApiAuth } from "@/lib/auth";
import { parseBooleanLike, parseCsv } from "@/lib/csv-utils";
import { sendInvoiceEmail } from "@/lib/email";
import { hasOutstandingBalance } from "@/lib/job-display";
import { recordJobAuditEvent } from "@/lib/job-audit";
import { dispatchJobTransitionWebhook } from "@/lib/outbound-webhooks";
import { prisma } from "@/lib/prisma";

const CSV_IMPORT_MAX_BYTES = Number.parseInt(process.env.CSV_IMPORT_MAX_BYTES ?? "1048576", 10);
const CSV_IMPORT_MAX_ROWS = Number.parseInt(process.env.CSV_IMPORT_MAX_ROWS ?? "1000", 10);
const CSV_IMPORT_MAX_FIELD_LENGTH = Number.parseInt(process.env.CSV_IMPORT_MAX_FIELD_LENGTH ?? "5000", 10);

function validateCsvPayloadSize(contentLengthHeader: string | null) {
  if (!contentLengthHeader) {
    return null;
  }
  const size = Number.parseInt(contentLengthHeader, 10);
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }
  if (size > CSV_IMPORT_MAX_BYTES) {
    return NextResponse.json(
      { error: `CSV payload exceeds ${CSV_IMPORT_MAX_BYTES} bytes.` },
      { status: 413 },
    );
  }
  return null;
}

function parseStatus(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "pending") {
    return JobStatusEnum.PENDING;
  }
  if (normalized === "printing") {
    return JobStatusEnum.PRINTING;
  }
  if (normalized === "completed") {
    return JobStatusEnum.COMPLETED;
  }
  return null;
}

function parseFulfillmentStatus(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "pending") {
    return FulfillmentStatusEnum.PENDING;
  }
  if (normalized === "ready") {
    return FulfillmentStatusEnum.READY;
  }
  if (normalized === "shipped") {
    return FulfillmentStatusEnum.SHIPPED;
  }
  if (normalized === "picked_up") {
    return FulfillmentStatusEnum.PICKED_UP;
  }
  return null;
}

export async function POST(request: NextRequest) {
  return withAdminApiAuth(request, async () => {
    const contentLengthViolation = validateCsvPayloadSize(request.headers.get("content-length"));
    if (contentLengthViolation) {
      return contentLengthViolation;
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let csvText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const text = formData.get("text");
      if (file instanceof File) {
        if (file.size > CSV_IMPORT_MAX_BYTES) {
          return NextResponse.json(
            { error: `Uploaded CSV file exceeds ${CSV_IMPORT_MAX_BYTES} bytes.` },
            { status: 413 },
          );
        }
        csvText = await file.text();
      } else if (typeof text === "string") {
        csvText = text;
      }
    } else {
      csvText = await request.text();
    }

    const csvBytes = Buffer.byteLength(csvText, "utf8");
    if (csvBytes > CSV_IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: `CSV payload exceeds ${CSV_IMPORT_MAX_BYTES} bytes.` }, { status: 413 });
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "CSV payload is empty." }, { status: 422 });
    }

    const records = parseCsv(csvText);
    if (records.length === 0) {
      return NextResponse.json({ error: "No CSV rows found." }, { status: 422 });
    }
    if (records.length > CSV_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        { error: `CSV payload has ${records.length} rows; maximum allowed is ${CSV_IMPORT_MAX_ROWS}.` },
        { status: 422 },
      );
    }

    for (let i = 0; i < records.length; i += 1) {
      const row = records[i] ?? {};
      for (const [field, value] of Object.entries(row)) {
        if (value.length > CSV_IMPORT_MAX_FIELD_LENGTH) {
          return NextResponse.json(
            {
              error: `Row ${i + 2} field '${field}' exceeds ${CSV_IMPORT_MAX_FIELD_LENGTH} characters.`,
            },
            { status: 422 },
          );
        }
      }
    }

    let updated = 0;
    let invoicesSent = 0;
    let skipped = 0;
    const errors: Array<{ row: number; paymentIntentId?: string; error: string }> = [];

    for (let i = 0; i < records.length; i += 1) {
      const rowNumber = i + 2;
      const row = records[i] ?? {};
      const paymentIntentId = (row.paymentIntentId ?? row.payment_intent_id ?? "").trim();
      if (!paymentIntentId) {
        errors.push({ row: rowNumber, error: "paymentIntentId is required." });
        continue;
      }

      const job = await prisma.job.findUnique({ where: { paymentIntentId } });
      if (!job) {
        errors.push({ row: rowNumber, paymentIntentId, error: "Job not found." });
        continue;
      }

      const status = parseStatus(row.status);
      if (status === null) {
        errors.push({ row: rowNumber, paymentIntentId, error: `Invalid status: ${row.status}` });
        continue;
      }

      const fulfillmentStatus = parseFulfillmentStatus(row.fulfillmentStatus ?? row.fulfillment_status);
      if (fulfillmentStatus === null) {
        errors.push({
          row: rowNumber,
          paymentIntentId,
          error: `Invalid fulfillmentStatus: ${row.fulfillmentStatus ?? row.fulfillment_status}`,
        });
        continue;
      }

      const viewed = parseBooleanLike(row.viewed);
      const sendInvoice = parseBooleanLike(row.sendInvoice ?? row.send_invoice) ?? false;
      const notes = typeof row.notes === "string" ? row.notes : undefined;

      const previousStatus = job.status;
      const previousFulfillmentStatus = job.fulfillmentStatus;

      const data: {
        status?: (typeof JobStatusEnum)[keyof typeof JobStatusEnum];
        fulfillmentStatus?: (typeof FulfillmentStatusEnum)[keyof typeof FulfillmentStatusEnum];
        fulfilledAt?: Date | null;
        viewedAt?: Date | null;
        notes?: string | null;
      } = {};
      if (status !== undefined) {
        data.status = status;
      }
      if (fulfillmentStatus !== undefined) {
        data.fulfillmentStatus = fulfillmentStatus;
        data.fulfilledAt =
          fulfillmentStatus === FulfillmentStatusEnum.SHIPPED || fulfillmentStatus === FulfillmentStatusEnum.PICKED_UP
            ? new Date()
            : null;
      }
      if (viewed === true) {
        data.viewedAt = job.viewedAt ?? new Date();
      } else if (viewed === false) {
        data.viewedAt = null;
      }
      if (notes !== undefined) {
        data.notes = notes.trim() ? notes : null;
      }

      const hasMutation = Object.keys(data).length > 0;
      const updatedJob = hasMutation
        ? await prisma.job.update({
            where: { paymentIntentId },
            data,
          })
        : job;

      if (hasMutation) {
        updated += 1;
      } else {
        skipped += 1;
      }

      if (previousStatus !== updatedJob.status || previousFulfillmentStatus !== updatedJob.fulfillmentStatus) {
        void dispatchJobTransitionWebhook({
          jobId: updatedJob.id,
          paymentIntentId: updatedJob.paymentIntentId,
          previousStatus,
          nextStatus: updatedJob.status,
          previousFulfillmentStatus,
          nextFulfillmentStatus: updatedJob.fulfillmentStatus,
          source: "csv_import",
          actor: "admin",
        });
      }

      if (previousStatus !== updatedJob.status) {
        await recordJobAuditEvent({
          jobId: updatedJob.id,
          paymentIntentId: updatedJob.paymentIntentId,
          eventType: "job_status_updated",
          actor: "csv_import",
          details: { from: previousStatus, to: updatedJob.status },
        });
      }
      if (previousFulfillmentStatus !== updatedJob.fulfillmentStatus) {
        await recordJobAuditEvent({
          jobId: updatedJob.id,
          paymentIntentId: updatedJob.paymentIntentId,
          eventType: "job_fulfillment_updated",
          actor: "csv_import",
          details: { from: previousFulfillmentStatus, to: updatedJob.fulfillmentStatus },
        });
      }
      if (notes !== undefined && (job.notes ?? "") !== (updatedJob.notes ?? "")) {
        await recordJobAuditEvent({
          jobId: updatedJob.id,
          paymentIntentId: updatedJob.paymentIntentId,
          eventType: "job_notes_updated",
          actor: "csv_import",
        });
      }

      if (sendInvoice) {
        if (updatedJob.customerEmail && hasOutstandingBalance(updatedJob)) {
          try {
            await sendInvoiceEmail(updatedJob);
            await prisma.job.update({
              where: { paymentIntentId },
              data: {
                invoiceSentAt: new Date(),
                invoiceSendCount: { increment: 1 },
              },
            });
            invoicesSent += 1;
            await recordJobAuditEvent({
              jobId: updatedJob.id,
              paymentIntentId: updatedJob.paymentIntentId,
              eventType: "bulk_invoice_sent",
              actor: "csv_import",
              details: { recipient: updatedJob.customerEmail },
            });
          } catch (error) {
            errors.push({
              row: rowNumber,
              paymentIntentId,
              error: error instanceof Error ? error.message : "Failed to send invoice",
            });
          }
        } else {
          errors.push({
            row: rowNumber,
            paymentIntentId,
            error: "Invoice skipped because email is missing or balance is already paid.",
          });
        }
      }
    }

    return NextResponse.json({
      rows: records.length,
      updated,
      invoicesSent,
      skipped,
      errors,
    });
  });
}
