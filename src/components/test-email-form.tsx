"use client";

import { useState } from "react";
import { useNotifications } from "@/components/notifications-provider";

interface Props {
  defaultRecipient?: string | null;
}

export function TestEmailForm({ defaultRecipient }: Props) {
  const [recipient, setRecipient] = useState(defaultRecipient ?? "");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notify } = useNotifications();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const trimmedRecipient = recipient.trim();
    if (!trimmedRecipient) {
      setError("Enter an email address to send the test message.");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: trimmedRecipient }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to send test email");
      }

      notify({ type: "success", message: `Sent test email to ${trimmedRecipient}` });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error while sending the test email.";
      setError(message);
      notify({ type: "error", message });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-xl border border-dashed border-white/20 bg-black/30 p-4 text-zinc-200"
    >
      <label className="text-sm font-medium text-zinc-200" htmlFor="test-email">
        Send a test receipt email
      </label>
      <p className="text-xs text-zinc-400">
        Use this to verify SMTP or Resend settings. The message is sent immediately and uses the configured
        `RECEIPT_FROM_EMAIL` as the sender.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="test-email"
          type="email"
          required
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="you@example.com"
          className="flex-1 rounded-md border border-white/10 bg-[#050505] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          disabled={isSending}
        />
        <button
          type="submit"
          className="rounded-md bg-gradient-to-b from-[#f6f6f6] to-[#d0d0d0] px-4 py-2 text-sm font-semibold text-[#111] shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSending}
        >
          {isSending ? "Sending..." : "Send test email"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </form>
  );
}
