"use client";

import { useId, useState } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, type StatusQueryValue } from "@/lib/format";
import { JobStatusBadge } from "@/components/job-status-badge";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

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
        headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
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
    <div className={`flex flex-col items-end gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-2">
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
            aria-label="Change job status"
            disabled={isUpdating}
            onClick={() => setIsOpen((open) => !open)}
            className={`group flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 shadow-[0_8px_22px_rgba(0,0,0,0.5)] transition hover:border-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 ${
              isOpen ? "border-white/50 bg-white/10 text-white" : ""
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
          {isOpen ? (
            <div
              role="menu"
              aria-labelledby={controlId}
              className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-white/15 bg-[#0b0b0b]/95 p-2 shadow-[0_25px_55px_rgba(0,0,0,0.65)] backdrop-blur-sm"
            >
              <p className="px-2 pb-2 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Set status
              </p>
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
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      isSelected
                        ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]"
                        : "text-zinc-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{label}</span>
                    {isSelected ? (
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="h-4 w-4 text-emerald-300"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 10l3 3 7-7" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
