import { JobStatus as JobStatusEnum, FulfillmentStatus as FulfillmentStatusEnum } from "@/generated/prisma/enums";
import type { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";

export type StatusQueryValue = Lowercase<JobStatus>;
export type FulfillmentQueryValue = Lowercase<FulfillmentStatus>;

export const STATUS_LABELS: Record<JobStatus, string> = {
  [JobStatusEnum.PENDING]: "Pending",
  [JobStatusEnum.PRINTING]: "Printing",
  [JobStatusEnum.COMPLETED]: "Completed",
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  [FulfillmentStatusEnum.PENDING]: "Not delivered",
  [FulfillmentStatusEnum.READY]: "Ready for pickup",
  [FulfillmentStatusEnum.SHIPPED]: "Shipped",
  [FulfillmentStatusEnum.PICKED_UP]: "Picked up",
};

export const STATUS_OPTIONS = (
  Object.entries(STATUS_LABELS) as Array<[JobStatus, string]>
).map(([value, label]) => ({
  value: value.toLowerCase() as StatusQueryValue,
  label,
}));

export const FULFILLMENT_OPTIONS = (
  Object.entries(FULFILLMENT_STATUS_LABELS) as Array<[FulfillmentStatus, string]>
).map(([value, label]) => ({
  value: value.toLowerCase() as FulfillmentQueryValue,
  label,
}));

export function formatCurrency(totalCents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(totalCents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(totalCents / 100).toFixed(2)}`;
  }
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
