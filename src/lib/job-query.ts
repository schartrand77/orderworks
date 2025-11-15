import { STATUS_LABELS } from "@/lib/format";
import type { JobStatus } from "@/generated/prisma/client";

const VALID_STATUSES = new Set(Object.keys(STATUS_LABELS));

export interface JobFilters {
  statuses: JobStatus[];
  createdFrom?: Date;
  createdTo?: Date;
}

export function parseJobFilters(params: URLSearchParams): JobFilters {
  const statuses = params
    .getAll("status")
    .flatMap((value) =>
      value
        .split(",")
        .map((status) => status.trim().toLowerCase())
        .filter(Boolean),
    )
    .map((status) => {
      if (!VALID_STATUSES.has(status)) {
        throw new Error(`Invalid status filter: ${status}`);
      }
      return status as JobStatus;
    });

  const createdFrom = parseDate(params.get("createdFrom"));
  const createdTo = parseDate(params.get("createdTo"));

  return { statuses, createdFrom, createdTo };
}

export function parseDate(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}
