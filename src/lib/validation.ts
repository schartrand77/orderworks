import { z } from "zod";
import type { JobStatus } from "@/generated/prisma/enums";
import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";

const numeric = z
  .union([z.number(), z.string()])
  .refine((value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) && Number.isInteger(value);
    }
    return /^-?\d+$/.test(value);
  }, "Expected an integer value")
  .transform((value) => (typeof value === "number" ? value : Number.parseInt(value, 10)));

const dateLike = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), "Invalid date");

const positiveInt = numeric.refine((value) => value > 0, "Value must be greater than zero");
const moneyCents = numeric.refine((value) => value >= 0, "Value must be zero or greater");

const lineItemSchema = z
  .object({
    description: z.string().min(1, "line item description is required"),
    quantity: positiveInt,
    unitPriceCents: moneyCents,
    material: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const jobPayloadSchema = z.object({
  id: z.string().min(1, "id is required"),
  paymentIntentId: z.string().min(1, "paymentIntentId is required"),
  totalCents: numeric,
  currency: z.string().min(1, "currency is required"),
  lineItems: z.array(lineItemSchema).min(1, "lineItems must include at least one entry"),
  shipping: z.unknown().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  userId: z.string().min(1).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  createdAt: dateLike,
});

export type JobPayload = z.infer<typeof jobPayloadSchema>;

const jobStatusValues = ["pending", "printing", "completed"] as const;
type JobStatusInput = (typeof jobStatusValues)[number];

const jobStatusMap: Record<JobStatusInput, JobStatus> = {
  pending: JobStatusEnum.PENDING,
  printing: JobStatusEnum.PRINTING,
  completed: JobStatusEnum.COMPLETED,
};

export const jobStatusUpdateSchema = z.object({
  status: z.enum(jobStatusValues),
  invoiceUrl: z.union([z.string().url("invoiceUrl must be a valid URL"), z.literal("")]).optional(),
  notes: z.string().optional(),
});

export type JobStatusUpdatePayload = z.infer<typeof jobStatusUpdateSchema>;

export function normalizeJobStatusUpdatePayload(payload: JobStatusUpdatePayload) {
  const trimmedNotes = payload.notes?.trim();
  return {
    status: jobStatusMap[payload.status],
    invoiceUrl:
      payload.invoiceUrl === undefined ? undefined : payload.invoiceUrl === "" ? null : payload.invoiceUrl,
    notes: trimmedNotes === undefined ? undefined : trimmedNotes.length === 0 ? null : trimmedNotes,
  } as const;
}
