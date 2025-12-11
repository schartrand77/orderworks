import type { JobStatus } from "@/generated/prisma/enums";
import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/format";

const STATUS_VARIANT_CLASSES: Record<JobStatus, string> = {
  [JobStatusEnum.PENDING]: "status-badge--pending",
  [JobStatusEnum.PRINTING]: "status-badge--printing",
  [JobStatusEnum.COMPLETED]: "status-badge--completed",
};

const FALLBACK_CLASS = "status-badge--default";

interface JobStatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const variant = STATUS_VARIANT_CLASSES[status] ?? FALLBACK_CLASS;
  const label = STATUS_LABELS[status] ?? status;
  const composedClassName = `status-badge ${variant}${className ? ` ${className}` : ""}`;

  return <span className={composedClassName}>{label}</span>;
}
