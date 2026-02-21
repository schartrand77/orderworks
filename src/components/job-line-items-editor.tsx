"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  lineItems: unknown;
}

const EMPTY_ARRAY_TEXT = "[]";

export function JobLineItemsEditor({ paymentIntentId, lineItems }: Props) {
  const router = useRouter();
  const { notify } = useNotifications();
  const initialText = useMemo(() => {
    if (lineItems === undefined) {
      return EMPTY_ARRAY_TEXT;
    }
    try {
      return JSON.stringify(lineItems, null, 2);
    } catch {
      return EMPTY_ARRAY_TEXT;
    }
  }, [lineItems]);
  const [jsonText, setJsonText] = useState(initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseLineItems(value: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Line items must be valid JSON.");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Line items must be a JSON array.");
    }
    return parsed;
  }

  function handleFormat() {
    setError(null);
    try {
      const parsed = parseLineItems(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to format line items.";
      setError(message);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let parsed: unknown[];
    try {
      parsed = parseLineItems(jsonText);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid line items.";
      setError(message);
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}`, {
        method: "PATCH",
        headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ lineItems: parsed }),
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to update line items");
      }

      if (body.job?.lineItems !== undefined) {
        setJsonText(JSON.stringify(body.job.lineItems, null, 2));
      }
      notify({ type: "success", message: "Line items updated." });
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
      <div className="rounded-lg border border-white/10 bg-black/40 p-3">
        <label className="mb-2 block text-sm font-medium text-zinc-200" htmlFor="line-items-json">
          Line items JSON
        </label>
        <textarea
          id="line-items-json"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          rows={10}
          className="w-full resize-y rounded-md border border-white/10 bg-[#050505] px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSubmitting}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Provide an array of line items. Each item should include at least `description`, `quantity`, and
          `unitPriceCents`. Optional fields include `material`, `color`, and `notes`.
        </p>
      </div>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleFormat}
          className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
          disabled={isSubmitting}
        >
          Format JSON
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gradient-to-r from-[#f6f6f6] to-[#cfcfcf] px-4 py-2 text-sm font-semibold text-[#111] shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save line items"}
        </button>
      </div>
    </form>
  );
}
