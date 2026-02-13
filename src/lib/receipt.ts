import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";

type LineItemLike = {
  description?: unknown;
  quantity?: unknown;
  unitPriceCents?: unknown;
};

function asLineItems(value: unknown): LineItemLike[] {
  return Array.isArray(value) ? (value as LineItemLike[]) : [];
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildReceiptEmail(job: Job) {
  const total = formatCurrency(job.totalCents, job.currency);
  const createdAt = formatDate(job.makerworksCreatedAt);
  const subject = `Receipt for MakerWorks job ${job.id}`;
  const lineItems = asLineItems(job.lineItems);
  const lineItemText =
    lineItems.length > 0
      ? lineItems.map((item, index) => {
          const description = typeof item.description === "string" && item.description.trim() ? item.description.trim() : `Item ${index + 1}`;
          const quantity = toPositiveNumber(item.quantity);
          const unitPriceCents = toPositiveNumber(item.unitPriceCents);
          if (quantity && unitPriceCents) {
            const lineTotal = formatCurrency(Math.round(quantity * unitPriceCents), job.currency);
            return `- ${description}: ${quantity} x ${formatCurrency(Math.round(unitPriceCents), job.currency)} = ${lineTotal}`;
          }
          return `- ${description}`;
        })
      : ["- Your job details are on file."];
  const lineItemHtml =
    lineItems.length > 0
      ? lineItems
          .map((item, index) => {
            const description =
              typeof item.description === "string" && item.description.trim() ? item.description.trim() : `Item ${index + 1}`;
            const quantity = toPositiveNumber(item.quantity);
            const unitPriceCents = toPositiveNumber(item.unitPriceCents);
            if (quantity && unitPriceCents) {
              const lineTotal = formatCurrency(Math.round(quantity * unitPriceCents), job.currency);
              return `<li>${escapeHtml(description)}: ${quantity} x ${formatCurrency(Math.round(unitPriceCents), job.currency)} = ${lineTotal}</li>`;
            }
            return `<li>${escapeHtml(description)}</li>`;
          })
          .join("")
      : "<li>Your job details are on file.</li>";

  const notesLine = job.notes ? `\nNotes:\n${job.notes}` : "";
  const text = [
    `Hi there,`,
    ``,
    `Thanks for your order. Your MakerWorks receipt is below.`,
    ``,
    `Job: ${job.id}`,
    `Payment intent: ${job.paymentIntentId}`,
    `Created: ${createdAt}`,
    `Total: ${total}`,
    ``,
    `Line items:`,
    ...lineItemText,
    ``,
    `If anything looks off, reply to this email and we will fix it.`,
    notesLine,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">MakerWorks receipt</h1>
      <p>Thanks for your order. Here is your receipt.</p>
      <ul style="padding-left: 18px;">
        <li><strong>Job:</strong> ${job.id}</li>
        <li><strong>Payment intent:</strong> ${job.paymentIntentId}</li>
        <li><strong>Created:</strong> ${createdAt}</li>
        <li><strong>Total:</strong> ${total}</li>
      </ul>
      <h2 style="font-size:16px;margin-top:20px;">Line items</h2>
      <ul style="padding-left: 18px;">${lineItemHtml}</ul>
      ${job.notes ? `<p><strong>Notes:</strong><br />${escapeHtml(job.notes).replace(/\n/g, "<br />")}</p>` : ""}
      <p style="margin-top:16px;">If anything looks off, reply to this email and we will fix it.</p>
    </div>
  `;

  return { subject, text, html };
}
