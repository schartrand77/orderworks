import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";

type LogLevel = "info" | "warn" | "error";

interface StructuredLogFields {
  requestId: string;
  route: string;
  durationMs?: number;
  jobId?: string;
  paymentIntentId?: string;
  [key: string]: string | number | boolean | null | undefined;
}

export function getRequestId(request: NextRequest) {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming) {
    return incoming;
  }
  return randomUUID();
}

export function logStructured(level: LogLevel, message: string, fields: StructuredLogFields) {
  const payload = {
    ts: new Date().toISOString(),
    message,
    ...fields,
  };
  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}
