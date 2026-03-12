import { createHmac } from "crypto";

interface JobTransitionWebhookInput {
  jobId: string;
  paymentIntentId: string;
  previousStatus: string;
  nextStatus: string;
  previousFulfillmentStatus: string;
  nextFulfillmentStatus: string;
  source: string;
  actor?: string;
}

function webhookUrls() {
  const raw = process.env.OUTBOUND_WEBHOOK_URLS?.trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function signPayload(payload: string) {
  const secret = process.env.OUTBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return null;
  }
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${digest}`;
}

export async function dispatchJobTransitionWebhook(input: JobTransitionWebhookInput) {
  if (
    input.previousStatus === input.nextStatus &&
    input.previousFulfillmentStatus === input.nextFulfillmentStatus
  ) {
    return;
  }

  const urls = webhookUrls();
  if (urls.length === 0) {
    return;
  }

  const event = {
    type: "job.transition",
    occurredAt: new Date().toISOString(),
    source: input.source,
    actor: input.actor ?? "system",
    jobId: input.jobId,
    paymentIntentId: input.paymentIntentId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    previousFulfillmentStatus: input.previousFulfillmentStatus,
    nextFulfillmentStatus: input.nextFulfillmentStatus,
  };
  const body = JSON.stringify(event);
  const signature = signPayload(body);
  const timeoutMs = Number.parseInt(process.env.OUTBOUND_WEBHOOK_TIMEOUT_MS ?? "", 10);
  const resolvedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;

  await Promise.allSettled(
    urls.map(async (url) => {
      const headers = new Headers({
        "Content-Type": "application/json",
      });
      if (signature) {
        headers.set("x-orderworks-signature", signature);
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(resolvedTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`);
      }
    }),
  ).catch((error) => {
    console.warn("Outbound webhook dispatch failed.", error);
  });
}
