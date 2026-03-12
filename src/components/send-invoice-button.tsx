"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNotifications } from "@/components/notifications-provider";
import { buildCsrfHeaders, handleUnauthorizedResponse } from "@/lib/client-auth";

interface Props {
  paymentIntentId: string;
  customerEmail?: string | null;
  disabled?: boolean;
}

export function SendInvoiceButton({ paymentIntentId, customerEmail, disabled = false }: Props) {
  const router = useRouter();
  const { notify } = useNotifications();
  const [isSending, setIsSending] = useState(false);

  async function handleSendInvoice() {
    if (disabled || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(paymentIntentId)}/invoice`, {
        method: "POST",
        headers: buildCsrfHeaders(),
      });
      if (handleUnauthorizedResponse(response.status)) {
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to send invoice");
      }

      notify({
        type: "success",
        message: customerEmail ? `Invoice emailed to ${customerEmail}.` : "Invoice sent.",
      });
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unexpected error while sending invoice.";
      notify({ type: "error", message });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSendInvoice}
      disabled={disabled || isSending}
      className="rounded-md bg-gradient-to-b from-[#fff2cf] to-[#ffe08d] px-4 py-2 text-sm font-semibold text-[#2a1a00] shadow-[0_15px_40px_rgba(0,0,0,0.65)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isSending ? "Sending invoice..." : "Send invoice"}
    </button>
  );
}
