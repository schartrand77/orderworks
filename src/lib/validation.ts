import { z } from "zod";
import type { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import { JobStatus as JobStatusEnum, FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";

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

const jobStatusValues = ["pending", "printing", "completed"] as const;
type JobStatusInput = (typeof jobStatusValues)[number];
const fulfillmentStatusValues = ["pending", "shipped", "picked_up"] as const;
type FulfillmentStatusInput = (typeof fulfillmentStatusValues)[number];

const jobStatusMap: Record<JobStatusInput, JobStatus> = {
  pending: JobStatusEnum.PENDING,
  printing: JobStatusEnum.PRINTING,
  completed: JobStatusEnum.COMPLETED,
};

const fulfillmentStatusMap: Record<FulfillmentStatusInput, FulfillmentStatus> = {
  pending: FulfillmentStatusEnum.PENDING,
  shipped: FulfillmentStatusEnum.SHIPPED,
  picked_up: FulfillmentStatusEnum.PICKED_UP,
};

export const jobStatusUpdateSchema = z
  .object({
    status: z.enum(jobStatusValues).optional(),
    notes: z.string().optional(),
    fulfillmentStatus: z.enum(fulfillmentStatusValues).optional(),
    lineItems: z.array(lineItemSchema).min(1, "lineItems cannot be empty").optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.notes !== undefined ||
      value.fulfillmentStatus !== undefined ||
      value.lineItems !== undefined,
    { message: "At least one field must be provided" },
  );

export type JobStatusUpdatePayload = z.infer<typeof jobStatusUpdateSchema>;

export function normalizeJobStatusUpdatePayload(payload: JobStatusUpdatePayload) {
  const trimmedNotes = payload.notes?.trim();
  return {
    ...(payload.status ? { status: jobStatusMap[payload.status] } : {}),
    notes: trimmedNotes === undefined ? undefined : trimmedNotes.length === 0 ? null : trimmedNotes,
    fulfillmentStatus:
      payload.fulfillmentStatus === undefined ? undefined : fulfillmentStatusMap[payload.fulfillmentStatus],
    ...(payload.lineItems ? { lineItems: payload.lineItems } : {}),
  } as const;
}

export const manualJobSchema = z.object({
  id: z.string().min(1, "id is required"),
  paymentIntentId: z.string().min(1, "paymentIntentId is required"),
  totalCents: moneyCents,
  currency: z.string().min(1, "currency is required"),
  makerworksCreatedAt: dateLike.optional(),
  userId: z.string().min(1).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  lineItems: z.array(lineItemSchema).optional(),
  shipping: z.unknown().optional(),
  metadata: z.unknown().optional(),
  notes: z.string().optional(),
  paymentStatus: z.string().min(1).optional(),
  paymentMethod: z.string().min(1).optional(),
  fulfillmentStatus: z.enum(fulfillmentStatusValues).optional(),
});

export type ManualJobPayload = z.infer<typeof manualJobSchema>;
