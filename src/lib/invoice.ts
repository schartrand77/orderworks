import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";

function stringify(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function getPaymentStatusText(job: Job) {
  const rawStatus = job.paymentStatus?.trim();
  if (!rawStatus) {
    return "Unpaid";
  }
  return rawStatus;
}

export function buildInvoiceEmail(job: Job) {
  const amountDue = formatCurrency(job.totalCents, job.currency);
  const createdAt = formatDate(job.makerworksCreatedAt);
  const subject = `Invoice for MakerWorks job ${job.id}`;
  const paymentStatus = getPaymentStatusText(job);

  const notesLine = job.notes ? `Notes:\n${job.notes}\n` : "";
  const text = [
    `Hello,`,
    ``,
    `This is your invoice for MakerWorks job ${job.id}.`,
    ``,
    `Job ID: ${job.id}`,
    `Payment intent: ${job.paymentIntentId}`,
    `Created: ${createdAt}`,
    `Payment status: ${paymentStatus}`,
    `Amount due: ${amountDue}`,
    notesLine,
    `Line items:`,
    stringify(job.lineItems),
    ``,
    `Shipping:`,
    stringify(job.shipping),
    ``,
    `Reply to this email if you have questions about payment.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">MakerWorks invoice</h1>
      <p>This is your invoice for MakerWorks job ${job.id}.</p>
      <ul style="padding-left: 18px;">
        <li><strong>Job ID:</strong> ${job.id}</li>
        <li><strong>Payment intent:</strong> ${job.paymentIntentId}</li>
        <li><strong>Created:</strong> ${createdAt}</li>
        <li><strong>Payment status:</strong> ${paymentStatus}</li>
        <li><strong>Amount due:</strong> ${amountDue}</li>
      </ul>
      ${job.notes ? `<p><strong>Notes:</strong><br />${job.notes.replace(/\n/g, "<br />")}</p>` : ""}
      <h2 style="font-size:16px;margin-top:20px;">Line items</h2>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${stringify(job.lineItems)}</pre>
      <h2 style="font-size:16px;margin-top:20px;">Shipping</h2>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${stringify(job.shipping)}</pre>
      <p style="margin-top:16px;">Reply to this email if you have questions about payment.</p>
    </div>
  `;

  return { subject, text, html };
}
