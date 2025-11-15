import type { JobStatus } from "@/generated/prisma/client";

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  processing: "Processing",
  done: "Done",
};

export const STATUS_OPTIONS = (
  Object.entries(STATUS_LABELS) as Array<[JobStatus, string]>
).map(([value, label]) => ({ value, label }));

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
