"use client";

import { useState } from "react";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  recipient: string;
}

export function SampleJobTestEmailButton({ recipient }: Props) {
  const [isSending, setIsSending] = useState(false);
  const { notify } = useNotifications();

  async function handleClick() {
    setIsSending(true);

    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: buildCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ to: recipient }),
      });

      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to send test email");
      }

      notify({ type: "success", message: `Sent test email to ${recipient}` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error while sending the test email.";
      notify({ type: "error", message });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSending}
      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSending ? "Sending..." : "Send test email"}
    </button>
  );
}
