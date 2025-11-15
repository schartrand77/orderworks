import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";

function stringify(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function buildReceiptEmail(job: Job) {
  const total = formatCurrency(job.totalCents, job.currency);
  const createdAt = formatDate(job.makerworksCreatedAt);
  const subject = `Receipt for MakerWorks job ${job.id}`;

  const invoiceLine = job.invoiceUrl ? `Invoice: ${job.invoiceUrl}\n` : "";
  const notesLine = job.notes ? `Notes:\n${job.notes}\n` : "";
  const text = [
    `Thanks for working with MakerWorks!`,
    ``,
    `Job ID: ${job.id}`,
    `Payment intent: ${job.paymentIntentId}`,
    `Created: ${createdAt}`,
    `Total: ${total}`,
    invoiceLine,
    notesLine,
    `Line items:`,
    stringify(job.lineItems),
    ``,
    `Shipping:`,
    stringify(job.shipping),
    ``,
    `Metadata:`,
    stringify(job.metadata),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">MakerWorks receipt</h1>
      <p>Thanks for working with MakerWorks. Here's a summary of your job.</p>
      <ul style="padding-left: 18px;">
        <li><strong>Job ID:</strong> ${job.id}</li>
        <li><strong>Payment intent:</strong> ${job.paymentIntentId}</li>
        <li><strong>Created:</strong> ${createdAt}</li>
        <li><strong>Total:</strong> ${total}</li>
      </ul>
      ${
        job.invoiceUrl
          ? `<p><strong>Invoice:</strong> <a href="${job.invoiceUrl}" target="_blank" rel="noopener noreferrer">${job.invoiceUrl}</a></p>`
          : ""
      }
      ${job.notes ? `<p><strong>Notes:</strong><br />${job.notes.replace(/\n/g, "<br />")}</p>` : ""}
      <h2 style="font-size:16px;margin-top:20px;">Line items</h2>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${stringify(job.lineItems)}</pre>
      <h2 style="font-size:16px;margin-top:20px;">Shipping</h2>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${stringify(job.shipping)}</pre>
      <h2 style="font-size:16px;margin-top:20px;">Metadata</h2>
      <pre style="background:#f4f4f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${stringify(job.metadata)}</pre>
    </div>
  `;

  return { subject, text, html };
}
