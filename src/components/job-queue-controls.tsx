"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  paymentIntentId: string;
  disableUp: boolean;
  disableDown: boolean;
}

async function moveJob(paymentIntentId: string, direction: "up" | "down") {
  const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Unable to reorder job");
  }
}

export function JobQueueControls({ paymentIntentId, disableUp, disableDown }: Props) {
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Move job up"
        onClick={() => handleClick("up")}
        disabled={isDisabled("up")}
        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Up
      </button>
      <button
        type="button"
        aria-label="Move job down"
        onClick={() => handleClick("down")}
        disabled={isDisabled("down")}
        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Down
      </button>
    </div>
  );
}
