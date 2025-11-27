"use client";

import { useEffect, useMemo, useState } from "react";
import type { MakerWorksStatusPayload, MakerWorksStatus } from "@/types/makerworks-status";
import { handleUnauthorizedResponse } from "@/lib/client-auth";

const POLL_INTERVAL_MS = 30_000;

type DisplayStatus = MakerWorksStatus | "loading";

interface StatusMeta {
  label: string;
  description: string;
  dotClass: string;
}

const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  connected: {
    label: "Connected to MakerWorks",
    description: "Receiving MakerWorks webhook payloads.",
    dotClass: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]",
  },
  waiting: {
    label: "Waiting for MakerWorks",
    description: "No MakerWorks payloads have been ingested yet.",
    dotClass: "bg-zinc-500",
  },
  stale: {
    label: "Connection stale",
    description: "No recent MakerWorks payloads detected.",
    dotClass: "bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]",
  },
  error: {
    label: "Status unavailable",
    description: "Unable to check MakerWorks connection.",
    dotClass: "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.65)]",
  },
  loading: {
    label: "Checking MakerWorks connection",
    description: "Fetching current status…",
    dotClass: "bg-zinc-600 animate-pulse",
  },
};

export function MakerWorksConnectionIndicator() {
  const [statusPayload, setStatusPayload] = useState<MakerWorksStatusPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchStatus() {
      try {
        const response = await fetch("/api/makerworks/status", { cache: "no-store" });
        if (handleUnauthorizedResponse(response.status)) {
          return;
        }
        const json = (await response.json()) as MakerWorksStatusPayload;

        if (!response.ok || json.status === "error") {
          throw new Error(json.error ?? `Status request failed (${response.status})`);
        }

        if (!isMounted) {
          return;
        }

        setStatusPayload(json);
        setFetchError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setFetchError(error instanceof Error ? error.message : "Unknown error");
        setStatusPayload(null);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const displayStatus: DisplayStatus = fetchError ? "error" : statusPayload?.status ?? "loading";
  const meta = STATUS_META[displayStatus];

  const secondaryText = useMemo(() => {
    if (displayStatus === "connected" || displayStatus === "stale") {
      return statusPayload?.lastJobReceivedAt
        ? `Last payload ${formatRelativeTime(statusPayload.lastJobReceivedAt)}`
        : "No MakerWorks payloads yet.";
    }
    if (displayStatus === "error" && fetchError) {
      return fetchError;
    }
    return meta.description;
  }, [displayStatus, fetchError, meta.description, statusPayload?.lastJobReceivedAt]);

  return (
    <div
      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      role="status"
      aria-live="polite"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-500">MakerWorks Link</p>
      <div className="mt-2 flex items-center gap-2 font-medium">
        <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} aria-hidden="true" />
        <span>{meta.label}</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">{secondaryText}</p>
    </div>
  );
}

function formatRelativeTime(timestamp: string) {
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 0) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
