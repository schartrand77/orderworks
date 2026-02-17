"use client";

import Link from "next/link";
import type { JobStatus } from "@/generated/prisma/enums";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { getPaymentMethodLabel, getPaymentStatusLabel } from "@/lib/job-display";
import { JobQueueControls } from "@/components/job-queue-controls";
import { SampleJobTestEmailButton } from "@/components/sample-job-test-email-button";
import { JobStatusQuickAction } from "@/components/job-status-quick-action";
import { handleUnauthorizedResponse } from "@/lib/client-auth";

const SAMPLE_JOB_ID = "makerworks-sample-job";

export interface SerializedJob {
  id: string;
  paymentIntentId: string;
  queuePosition: number;
  viewedAt: string | null;
  status: JobStatus;
  totalCents: number;
  currency: string;
  makerworksCreatedAt: string;
  customerEmail: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
}

interface Props {
  jobs: SerializedJob[];
  nextCursor?: string | null;
  queryBase?: string;
}

async function moveJob(paymentIntentId: string, targetIndex: number) {
  const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetIndex }),
  });

  if (handleUnauthorizedResponse(response.status)) {
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Unable to reorder job");
  }
}

function reorderList(list: SerializedJob[], fromIndex: number, toIndex: number) {
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function JobTableClient({ jobs, nextCursor, queryBase }: Props) {
  const router = useRouter();
  const [orderedJobs, setOrderedJobs] = useState(jobs);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    setOrderedJobs(jobs);
  }, [jobs]);

  const jobIndexLookup = useMemo(() => {
    return new Map(orderedJobs.map((job, index) => [job.id, index]));
  }, [orderedJobs]);

  async function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId || isReordering) {
      return;
    }

    const fromIndex = jobIndexLookup.get(draggingId);
    const toIndex = jobIndexLookup.get(targetId);
    if (fromIndex === undefined || toIndex === undefined || fromIndex === toIndex) {
      return;
    }

    const draggedJob = orderedJobs[fromIndex];
    if (!draggedJob) {
      return;
    }

    setOrderedJobs((current) => reorderList(current, fromIndex, toIndex));
    setIsReordering(true);

    try {
      await moveJob(draggedJob.paymentIntentId, toIndex);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Unable to reorder job");
      setOrderedJobs(jobs);
    } finally {
      setIsReordering(false);
      setDraggingId(null);
      setDragOverId(null);
    }
  }

  if (orderedJobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 bg-black/30 p-8 text-center text-sm text-zinc-300">
        No jobs found. Adjust your filters or wait for new MakerWorks submissions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#070707]/90 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm text-zinc-100">
        <thead className="bg-white/5 text-xs uppercase tracking-[0.25em] text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Queue</th>
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Payment</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {orderedJobs.map((job, index) => {
            const isUnviewed = !job.viewedAt;
            const paymentStatusLabel = getPaymentStatusLabel(job);
            const isDragging = draggingId === job.id;
            const isOver = dragOverId === job.id;

            return (
              <tr
                key={job.id}
                draggable={!isReordering}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", job.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingId(job.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isReordering) {
                    setDragOverId(job.id);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain");
                  if (sourceId) {
                    setDraggingId(sourceId);
                    void handleDrop(job.id);
                  }
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                className={`transition ${
                  isUnviewed ? "bg-amber-500/10 hover:bg-amber-500/20" : "hover:bg-white/5"
                } ${isDragging ? "opacity-60" : ""} ${isOver ? "ring-1 ring-white/30" : ""}`}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <JobQueueControls
                      paymentIntentId={job.paymentIntentId}
                      disableUp={index === 0 || isReordering}
                      disableDown={index === orderedJobs.length - 1 || isReordering}
                    >
                      <span className="text-sm font-semibold text-white/80">#{job.queuePosition}</span>
                    </JobQueueControls>
                    {isUnviewed ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-amber-100">
                        New
                      </span>
                    ) : null}
                    <Link
                      className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:bg-white/10"
                      href={`/jobs/${encodeURIComponent(job.paymentIntentId)}`}
                    >
                      View
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-4 text-white">
                  <div className="flex flex-col gap-1">
                    <span>{job.customerEmail ?? "Unknown customer"}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-zinc-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{getPaymentMethodLabel(job)}</span>
                    {paymentStatusLabel ? (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                        {paymentStatusLabel}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-white">
                  {formatCurrency(job.totalCents, job.currency)}
                </td>
                <td className="px-4 py-4 text-zinc-400">
                  {formatDate(new Date(job.makerworksCreatedAt))}
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="flex flex-col items-end gap-3">
                    {job.id === SAMPLE_JOB_ID && job.customerEmail ? (
                      <SampleJobTestEmailButton recipient={job.customerEmail} />
                    ) : null}
                    <JobStatusQuickAction
                      paymentIntentId={job.paymentIntentId}
                      initialStatus={job.status}
                      className="w-full max-w-[180px]"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nextCursor ? (
        <div className="flex justify-center border-t border-white/10 p-4">
          <Link
            className="rounded-md border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-100 transition hover:border-white/40 hover:bg-white/10"
            href={`/?${queryBase ? `${queryBase}&` : ""}after=${encodeURIComponent(nextCursor)}`}
          >
            Next Page
          </Link>
        </div>
      ) : null}
    </div>
  );
}
