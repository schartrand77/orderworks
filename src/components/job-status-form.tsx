"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { JobStatus, FulfillmentStatus } from "@/generated/prisma/enums";
import {
  STATUS_LABELS,
  type StatusQueryValue,
  FULFILLMENT_STATUS_LABELS,
  FULFILLMENT_OPTIONS,
  type FulfillmentQueryValue,
  formatDate,
} from "@/lib/format";
import { useNotifications } from "@/components/notifications-provider";
import { handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  currentStatus: JobStatus;
  defaultInvoiceUrl?: string | null;
  defaultNotes?: string | null;
  customerEmail?: string | null;
  currentFulfillmentStatus: FulfillmentStatus;
  fulfilledAt?: string | null;
}

const STATUS_SELECT_OPTIONS = (Object.entries(STATUS_LABELS) as Array<[JobStatus, string]>).map(
  ([status, label]) => ({
    status,
    label,
    inputValue: status.toLowerCase() as StatusQueryValue,
  }),
);

export function JobStatusForm({
  paymentIntentId,
  currentStatus,
  defaultInvoiceUrl,
  defaultNotes,
  customerEmail,
  currentFulfillmentStatus,
  fulfilledAt,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusQueryValue>(currentStatus.toLowerCase() as StatusQueryValue);
  const [invoiceUrl, setInvoiceUrl] = useState(defaultInvoiceUrl ?? "");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentQueryValue>(
    currentFulfillmentStatus.toLowerCase() as FulfillmentQueryValue,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotifications();
  const [lastFulfilledAt, setLastFulfilledAt] = useState<Date | null>(
    fulfilledAt ? new Date(fulfilledAt) : null,
  );
  const fulfillmentStatusLabel =
    FULFILLMENT_STATUS_LABELS[fulfillmentStatus.toUpperCase() as FulfillmentStatus] ?? "Not delivered";

  const requiresReceipt = status === "completed";
  const hasCustomerEmail = Boolean(customerEmail);
  const submitLabel = requiresReceipt ? "Complete & send receipt" : "Save status";

  const completionHint = useMemo(() => {
    if (!requiresReceipt) {
      return null;
    }
    if (!hasCustomerEmail) {
      return "A customer email address is required before a receipt can be sent.";
    }
    return `A receipt will be emailed to ${customerEmail}.`;
  }, [requiresReceipt, hasCustomerEmail, customerEmail]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, invoiceUrl, notes, fulfillmentStatus }),
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to update job status");
      }

      const nextStatus = (body.job.status as JobStatus).toLowerCase() as StatusQueryValue;
      setStatus(nextStatus);
      setInvoiceUrl(body.job.invoiceUrl ?? "");
      setNotes(body.job.notes ?? "");
      if (body.job?.fulfillmentStatus) {
        setFulfillmentStatus((body.job.fulfillmentStatus as FulfillmentStatus).toLowerCase() as FulfillmentQueryValue);
      }
      if (body.job && Object.prototype.hasOwnProperty.call(body.job, "fulfilledAt")) {
        setLastFulfilledAt(body.job.fulfilledAt ? new Date(body.job.fulfilledAt as string) : null);
      }
      const updatedJobEmail =
        typeof body.job?.customerEmail === "string" ? (body.job.customerEmail as string) : null;
      if (nextStatus === "completed") {
        const recipient = updatedJobEmail ?? customerEmail;
        notify({
          type: "success",
          message: recipient
            ? `Job completed. Receipt emailed to ${recipient}.`
            : "Job completed and receipt email sent.",
        });
      } else {
        notify({ type: "success", message: "Job status updated." });
      }
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error";
      setError(message);
      notify({ type: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-200" htmlFor="job-status">
          Status
        </label>
        <select
          id="job-status"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusQueryValue)}
          className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSubmitting}
        >
          {STATUS_SELECT_OPTIONS.map((option) => (
            <option key={option.status} value={option.inputValue}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-200" htmlFor="fulfillment-status">
          Fulfillment status
        </label>
        <select
          id="fulfillment-status"
          value={fulfillmentStatus}
          onChange={(event) => setFulfillmentStatus(event.target.value as FulfillmentQueryValue)}
          className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSubmitting}
        >
          {FULFILLMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {lastFulfilledAt && fulfillmentStatus !== "pending" ? (
          <p className="mt-1 text-xs text-zinc-400">
            Marked {fulfillmentStatusLabel.toLowerCase()} {formatDate(lastFulfilledAt)}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Track when the job leaves the shop by marking it shipped or picked up.
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-200" htmlFor="invoiceUrl">
          Invoice URL
        </label>
        <input
          id="invoiceUrl"
          name="invoiceUrl"
          type="url"
          value={invoiceUrl}
          onChange={(event) => setInvoiceUrl(event.target.value)}
          placeholder="https://"
          className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-200" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSubmitting}
        />
      </div>
      {completionHint ? <p className="text-sm text-zinc-300">{completionHint}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting || (requiresReceipt && !hasCustomerEmail)}
        className="rounded-md bg-gradient-to-r from-[#f6f6f6] to-[#cfcfcf] px-4 py-2 text-sm font-semibold text-[#111] shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
