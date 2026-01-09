import type { Job } from "@/generated/prisma/client";

type JsonRecord = Record<string, unknown>;

function extractNestedString(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

export function getCustomerName(job: Job) {
  const shippingName =
    extractNestedString(job.shipping, ["address", "name"]) ?? extractNestedString(job.shipping, ["name"]);
  if (shippingName) {
    return shippingName;
  }

  const metadataName =
    extractNestedString(job.metadata, ["customer_name"]) ??
    extractNestedString(job.metadata, ["customerName"]) ??
    extractNestedString(job.metadata, ["customer"]);
  if (metadataName) {
    return metadataName;
  }

  if (job.customerEmail && job.customerEmail.trim().length > 0) {
    return job.customerEmail;
  }

  return null;
}

export function getPaymentMethodLabel(job: Job) {
  const method = job.paymentMethod?.toLowerCase().trim();
  if (method) {
    if (method.includes("cash") || method.includes("check")) {
      return "Cash";
    }
    if (method.includes("card") || method.includes("credit") || method.includes("stripe")) {
      return "Card";
    }
  }

  const intent = job.paymentIntentId?.toLowerCase().trim();
  if (intent && intent.startsWith("cash")) {
    return "Cash";
  }

  return "Card";
}

function humanizeValue(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getPaymentStatusLabel(job: Job) {
  const rawStatus = job.paymentStatus?.trim();
  if (!rawStatus) {
    return null;
  }

  const normalized = rawStatus.toLowerCase();
  const unpaidKeywords = ["unpaid", "pending", "failed", "declined", "canceled", "cancelled", "refunded", "void"];
  if (unpaidKeywords.some((keyword) => normalized.includes(keyword))) {
    return humanizeValue(rawStatus);
  }

  const paidKeywords = ["paid", "succeeded", "success", "captured", "complete", "completed", "settled"];
  if (paidKeywords.some((keyword) => normalized.includes(keyword))) {
    return "Paid";
  }

  return humanizeValue(rawStatus);
}
