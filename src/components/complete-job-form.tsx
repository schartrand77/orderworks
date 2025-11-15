"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  paymentIntentId: string;
  defaultInvoiceUrl?: string | null;
  defaultNotes?: string | null;
  disabled?: boolean;
}

export function CompleteJobForm({
  paymentIntentId,
  defaultInvoiceUrl,
  defaultNotes,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [invoiceUrl, setInvoiceUrl] = useState(defaultInvoiceUrl ?? "");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceUrl, notes }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to mark job complete");
      }

      setSuccess("Job marked as complete");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          disabled={isSubmitting || disabled}
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
          disabled={isSubmitting || disabled}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting || disabled}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Saving..." : disabled ? "Already completed" : "Mark as complete"}
      </button>
    </form>
  );
}
