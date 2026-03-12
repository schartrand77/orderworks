"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  disableUp: boolean;
  disableDown: boolean;
  children?: ReactNode;
}

async function moveJob(paymentIntentId: string, direction: "up" | "down") {
  const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}/queue`, {
    method: "POST",
    headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ direction }),
  });

  if (handleUnauthorizedResponse(response.status)) {
    return;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Unable to reorder job");
  }
}

export function JobQueueControls({ paymentIntentId, disableUp, disableDown, children }: Props) {
  const router = useRouter();
  const [pendingDirection, setPendingDirection] = useState<"up" | "down" | null>(null);
  const isDisabled = (direction: "up" | "down") =>
    pendingDirection !== null || (direction === "up" ? disableUp : disableDown);

  async function handleClick(direction: "up" | "down") {
    if (isDisabled(direction)) {
      return;
    }
    setPendingDirection(direction);
    try {
      await moveJob(paymentIntentId, direction);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Unable to reorder job");
    } finally {
      setPendingDirection(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label="Move job up"
        onClick={() => handleClick("up")}
        disabled={isDisabled("up")}
        className="group flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition hover:border-white/40 hover:bg-white/10 hover:text-white hover:shadow-[0_12px_26px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-3.5 w-3.5 transition-transform group-active:-translate-y-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5-5 5 5" />
        </svg>
      </button>
      {children}
      <button
        type="button"
        aria-label="Move job down"
        onClick={() => handleClick("down")}
        disabled={isDisabled("down")}
        className="group flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 shadow-[0_8px_18px_rgba(0,0,0,0.45)] transition hover:border-white/40 hover:bg-white/10 hover:text-white hover:shadow-[0_12px_26px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="h-3.5 w-3.5 transition-transform group-active:translate-y-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>
    </div>
  );
}
