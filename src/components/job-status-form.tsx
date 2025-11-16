"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { JobStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, type StatusQueryValue } from "@/lib/format";
import { useNotifications } from "@/components/notifications-provider";

interface Props {
  paymentIntentId: string;
  currentStatus: JobStatus;
  defaultInvoiceUrl?: string | null;
  defaultNotes?: string | null;
  customerEmail?: string | null;
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
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusQueryValue>(currentStatus.toLowerCase() as StatusQueryValue);
  const [invoiceUrl, setInvoiceUrl] = useState(defaultInvoiceUrl ?? "");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotifications();

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
        body: JSON.stringify({ status, invoiceUrl, notes }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to update job status");
      }

      const nextStatus = (body.job.status as JobStatus).toLowerCase() as StatusQueryValue;
      setStatus(nextStatus);
      setInvoiceUrl(body.job.invoiceUrl ?? "");
      setNotes(body.job.notes ?? "");
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
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="job-status">
          Status
        </label>
        <select
          id="job-status"
          name="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusQueryValue)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="invoiceUrl">
          Invoice URL
        </label>
        <input
          id="invoiceUrl"
          name="invoiceUrl"
          type="url"
          value={invoiceUrl}
          onChange={(event) => setInvoiceUrl(event.target.value)}
          placeholder="https://"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          disabled={isSubmitting}
        />
      </div>
      {completionHint ? <p className="text-sm text-zinc-600">{completionHint}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting || (requiresReceipt && !hasCustomerEmail)}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
