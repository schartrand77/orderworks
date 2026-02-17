import type { Job } from "@/generated/prisma/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toCustomerFacingLineItemDescription, toCustomerFacingUnitPriceCents } from "@/lib/line-item-display";

type LineItemLike = {
  description?: unknown;
  quantity?: unknown;
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
  const subject = `Invoice reminder for MakerWorks job ${job.id}`;
  const paymentStatus = getPaymentStatusText(job);
  const lineItems = asLineItems(job.lineItems);
  const lineItemText =
    lineItems.length > 0
      ? lineItems.map((item, index) => {
          const description = toCustomerFacingLineItemDescription(item.description, `Item ${index + 1}`);
          const quantity = toPositiveNumber(item.quantity);
          const unitPriceCents = toCustomerFacingUnitPriceCents(item);
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
            const description = toCustomerFacingLineItemDescription(item.description, `Item ${index + 1}`);
            const quantity = toPositiveNumber(item.quantity);
            const unitPriceCents = toCustomerFacingUnitPriceCents(item);
            if (quantity && unitPriceCents) {
              const lineTotal = formatCurrency(Math.round(quantity * unitPriceCents), job.currency);
              return `<li>${escapeHtml(description)}: ${quantity} x ${formatCurrency(Math.round(unitPriceCents), job.currency)} = ${lineTotal}</li>`;
            }
            return `<li>${escapeHtml(description)}</li>`;
          })
          .join("")
      : "<li>Your job details are on file.</li>";

  const notesLine = job.notes ? `\nOrder notes:\n${job.notes}` : "";
  const text = [
    `Hey friend,`,
    ``,
    `The shop boss asked me to send a friendly reminder: this invoice is still open.`,
    ``,
    `Job: ${job.id}`,
    `Payment intent: ${job.paymentIntentId}`,
    `Created: ${createdAt}`,
    `Payment status: ${paymentStatus}`,
    `Amount due: ${amountDue}`,
    ``,
    `Line items:`,
    ...lineItemText,
    ``,
    `No kneecaps are at risk, but payment would make everyone smile.`,
    `Reply to this email if you have questions.`,
    notesLine,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111;">
      <h1 style="font-size: 20px; margin-bottom: 8px;">MakerWorks invoice</h1>
      <p>The shop boss asked for a friendly reminder: this invoice is still open.</p>
      <ul style="padding-left: 18px;">
        <li><strong>Job:</strong> ${job.id}</li>
        <li><strong>Payment intent:</strong> ${job.paymentIntentId}</li>
        <li><strong>Created:</strong> ${createdAt}</li>
        <li><strong>Payment status:</strong> ${paymentStatus}</li>
        <li><strong>Amount due:</strong> ${amountDue}</li>
      </ul>
      <h2 style="font-size:16px;margin-top:20px;">Line items</h2>
      <ul style="padding-left: 18px;">${lineItemHtml}</ul>
      ${job.notes ? `<p><strong>Order notes:</strong><br />${escapeHtml(job.notes).replace(/\n/g, "<br />")}</p>` : ""}
      <p style="margin-top:16px;">No kneecaps are at risk, but payment would make everyone smile.</p>
      <p style="margin-top:8px;">Reply to this email if you have questions.</p>
    </div>
  `;

  return { subject, text, html };
}
