"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  jobId: string;
}

export function JobDeleteButton({ paymentIntentId, jobId }: Props) {
  const router = useRouter();
  const { notify } = useNotifications();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete job "${jobId}"? This removes it from the queue and cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}`, {
        method: "DELETE",
        headers: buildCsrfHeaders(),
      });
      if (handleUnauthorizedResponse(response.status)) {
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to delete job");
      }

      notify({ type: "success", message: "Job deleted." });
      router.push("/");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error";
      notify({ type: "error", message });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="rounded-md border border-red-500/60 bg-red-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? "Deleting..." : "Delete job"}
    </button>
  );
}
