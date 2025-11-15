import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import type { JobStatus } from "@/generated/prisma/enums";

export type StatusQueryValue = Lowercase<JobStatus>;

export const STATUS_LABELS: Record<JobStatus, string> = {
  [JobStatusEnum.PENDING]: "Pending",
  [JobStatusEnum.PRINTING]: "Printing",
  [JobStatusEnum.COMPLETED]: "Completed",
};

export const STATUS_OPTIONS = (
  Object.entries(STATUS_LABELS) as Array<[JobStatus, string]>
).map(([value, label]) => ({
  value: value.toLowerCase() as StatusQueryValue,
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
