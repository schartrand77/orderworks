"use client";

import { useState } from "react";
import { useNotifications } from "@/components/notifications-provider";

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipient }),
      });

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
      className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSending ? "Sending..." : "Send test email"}
    </button>
  );
}
