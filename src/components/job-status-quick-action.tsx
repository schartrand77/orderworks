"use client";

import { useId, useState } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, type StatusQueryValue } from "@/lib/format";
import { JobStatusBadge } from "@/components/job-status-badge";
import { useNotifications } from "@/components/notifications-provider";
import { handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  initialStatus: JobStatus;
  className?: string;
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as Array<[JobStatus, string]>;

export function JobStatusQuickAction({ paymentIntentId, initialStatus, className }: Props) {
  const [status, setStatus] = useState<JobStatus>(initialStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotifications();
  const controlId = useId();
  const selectValue = status.toLowerCase() as StatusQueryValue;

  function toJobStatus(value: StatusQueryValue): JobStatus {
    return value.toUpperCase() as JobStatus;
  }

  async function handleStatusChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextValue = event.target.value as StatusQueryValue;
    if (nextValue === selectValue || isUpdating) {
      return;
    }
    const previousStatus = status;
    const optimisticStatus = toJobStatus(nextValue);
    setStatus(optimisticStatus);
    setIsUpdating(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextValue }),
      });
      if (handleUnauthorizedResponse(response.status)) {
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to update job status");
      }
      const nextStatus = body.job?.status as JobStatus | undefined;
      if (nextStatus) {
        setStatus(nextStatus);
        notify({ type: "success", message: `Status set to ${STATUS_LABELS[nextStatus]}.` });
      } else {
        throw new Error("Missing updated job status from server response");
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error while updating status";
      setStatus(previousStatus);
      setError(message);
      notify({ type: "error", message });
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <JobStatusBadge status={status} />
      <label className="sr-only" htmlFor={controlId}>
        Change job status
      </label>
      <select
        id={controlId}
        className="w-full rounded-md border border-white/10 bg-[#050505] px-2 py-1 text-xs font-medium text-zinc-100 outline-none transition hover:border-white/30 focus:border-white/60"
        value={selectValue}
        onChange={handleStatusChange}
        disabled={isUpdating}
      >
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value.toLowerCase()}>
            {label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
