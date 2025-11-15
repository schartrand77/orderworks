import type { Job } from "@/generated/prisma/client";
import { buildReceiptEmail } from "@/lib/receipt";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendReceiptEmail(job: Job) {
  if (!job.customerEmail) {
    throw new Error("Job is missing a customer email address.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const fromEmail = process.env.RECEIPT_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("RECEIPT_FROM_EMAIL is not configured.");
  }

  const { subject, text, html } = buildReceiptEmail(job);
  const payload = {
    from: fromEmail,
    to: job.customerEmail,
    subject,
    text,
    html,
  };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to send receipt email: ${message}`);
  }
}
