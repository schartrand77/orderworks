import nodemailer from "nodemailer";
import type { Job } from "@/generated/prisma/client";
import { buildReceiptEmail } from "@/lib/receipt";
import { buildInvoiceEmail } from "@/lib/invoice";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

export async function sendReceiptEmail(job: Job) {
  if (!job.customerEmail) {
    throw new Error("Job is missing a customer email address.");
  }

  const fromEmail = process.env.RECEIPT_FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("RECEIPT_FROM_EMAIL is not configured.");
  }

  const replyToEmail = process.env.RECEIPT_REPLY_TO_EMAIL?.trim();
  const { subject, text, html } = buildReceiptEmail(job);
  const payload: EmailPayload = {
    from: fromEmail,
    to: job.customerEmail,
    subject,
    text,
    html,
    replyTo: replyToEmail,
  };

  await deliverEmail(payload);
}

export async function sendInvoiceEmail(job: Job) {
  if (!job.customerEmail) {
    throw new Error("Job is missing a customer email address.");
  }

  const fromEmail = process.env.INVOICE_FROM_EMAIL?.trim() || process.env.RECEIPT_FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("INVOICE_FROM_EMAIL or RECEIPT_FROM_EMAIL is required.");
  }

  const replyToEmail = process.env.INVOICE_REPLY_TO_EMAIL?.trim() || process.env.RECEIPT_REPLY_TO_EMAIL?.trim();
  const { subject, text, html } = buildInvoiceEmail(job);
  const payload: EmailPayload = {
    from: fromEmail,
    to: job.customerEmail,
    subject,
    text,
    html,
    replyTo: replyToEmail,
  };

  await deliverEmail(payload);
}

export async function sendTestEmail(recipient: string) {
  const fromEmail = process.env.RECEIPT_FROM_EMAIL?.trim();
  if (!fromEmail) {
    throw new Error("RECEIPT_FROM_EMAIL is not configured.");
  }

  if (!recipient) {
    throw new Error("A destination email address is required.");
  }

  const replyToEmail = process.env.RECEIPT_REPLY_TO_EMAIL;
  const payload: EmailPayload = {
    from: fromEmail,
    to: recipient,
    subject: "OrderWorks test email",
    text: [
      "This is a test email from OrderWorks.",
      "Your email transport configuration is working.",
      "You can now complete a job to send a real receipt.",
    ].join("\n"),
    html: `<p>This is a <strong>test email</strong> from OrderWorks.</p><p>Your email transport configuration is working. You can now complete a job to send a real receipt.</p>`,
    replyTo: replyToEmail,
  };

  await deliverEmail(payload);
}

const RESEND_PLACEHOLDER = "resend_api_key";

async function deliverEmail(payload: EmailPayload) {
  const resendApiKeyRaw = process.env.RESEND_API_KEY?.trim();
  const resendApiKey =
    resendApiKeyRaw && resendApiKeyRaw.toLowerCase() !== RESEND_PLACEHOLDER ? resendApiKeyRaw : null;

  if (resendApiKey) {
    await sendViaResend(payload, resendApiKey);
    return;
  }

  if (process.env.SMTP_HOST) {
    await sendViaSmtp(payload);
    return;
  }

  throw new Error("Configure RESEND_API_KEY or SMTP_* variables to send emails.");
}

async function sendViaResend(payload: EmailPayload, apiKey: string): Promise<void> {
  const resendPayload = {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
  };

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to send email: ${message}`);
  }
}

async function sendViaSmtp(payload: EmailPayload): Promise<void> {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const secureFlag = process.env.SMTP_SECURE ?? "false";

  if (!host || !portStr || !user || !password) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD must be configured for SMTP delivery.");
  }

  const port = Number(portStr);
  if (Number.isNaN(port)) {
    throw new Error("SMTP_PORT must be a valid number.");
  }

  const secure = ["1", "true", "yes"].includes(secureFlag.toLowerCase());

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },
  });

  await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
  });
}
