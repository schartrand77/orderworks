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
  const [isOpen, setIsOpen] = useState(false);

  function toJobStatus(value: StatusQueryValue): JobStatus {
    return value.toUpperCase() as JobStatus;
  }

  async function handleStatusChange(nextValue: StatusQueryValue) {
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
      <div
        className="relative"
        tabIndex={-1}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsOpen(false);
          }
        }}
      >
        <label className="sr-only" htmlFor={controlId}>
          Change job status
        </label>
        <button
          id={controlId}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          disabled={isUpdating}
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-[#050505] px-2 py-1 text-xs font-medium text-zinc-100 outline-none transition hover:border-white/30 focus:border-white/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{STATUS_LABELS[status]}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {isOpen ? (
          <div
            role="menu"
            aria-labelledby={controlId}
            className="absolute right-0 z-10 mt-2 w-full min-w-[180px] rounded-md border border-white/10 bg-[#0b0b0b] p-1 shadow-[0_20px_45px_rgba(0,0,0,0.55)]"
          >
            {STATUS_OPTIONS.map(([value, label]) => {
              const optionValue = value.toLowerCase() as StatusQueryValue;
              const isSelected = optionValue === selectValue;
              return (
                <button
                  key={value}
                  role="menuitemradio"
                  aria-checked={isSelected}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => {
                    setIsOpen(false);
                    handleStatusChange(optionValue);
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs font-medium transition ${
                    isSelected
                      ? "bg-white/10 text-white"
                      : "text-zinc-200 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>{label}</span>
                  {isSelected ? <span aria-hidden="true">✓</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
