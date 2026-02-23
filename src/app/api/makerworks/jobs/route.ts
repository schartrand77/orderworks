import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getRequestClientIp, validateAdminSessionToken } from "@/lib/auth";
import { syncMakerWorksJobs } from "@/lib/makerworks-sync";
import { getRateLimitState, recordRateLimitFailure } from "@/lib/request-rate-limit";

const MAKERWORKS_JOBS_RATE_LIMIT_SCOPE = "makerworks_jobs_trigger";
const MAKERWORKS_JOBS_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAKERWORKS_JOBS_RATE_LIMIT_MAX_ATTEMPTS = 5;

function safeCompareString(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function readSharedSecretFromRequest(request: NextRequest) {
  const bearer = request.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return request.headers.get("x-makerworks-sync-secret")?.trim() ?? "";
}

function isSharedSecretAuthorized(request: NextRequest) {
  const expected = process.env.MAKERWORKS_SYNC_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const provided = readSharedSecretFromRequest(request);
  if (!provided) {
    return false;
  }
  return safeCompareString(expected, provided);
}

function isAdminSessionAuthorized(request: NextRequest) {
  return validateAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

function buildRateLimitKey(request: NextRequest, authMode: "shared_secret" | "admin_session") {
  return `${getRequestClientIp(request)}|${authMode}`;
}

async function enforceTriggerRateLimit(request: NextRequest, authMode: "shared_secret" | "admin_session") {
  const key = buildRateLimitKey(request, authMode);
  const state = await getRateLimitState({
    scope: MAKERWORKS_JOBS_RATE_LIMIT_SCOPE,
    key,
    windowMs: MAKERWORKS_JOBS_RATE_LIMIT_WINDOW_MS,
    maxAttempts: MAKERWORKS_JOBS_RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (!state.limited) {
    return null;
  }
  await recordRateLimitFailure({
    scope: MAKERWORKS_JOBS_RATE_LIMIT_SCOPE,
    key,
    windowMs: MAKERWORKS_JOBS_RATE_LIMIT_WINDOW_MS,
  });
  return NextResponse.json(
    { error: "Too many sync trigger requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(state.retryAfterSeconds) },
    },
  );
}

export async function POST(request: NextRequest) {
  const authMode = isSharedSecretAuthorized(request)
    ? "shared_secret"
    : isAdminSessionAuthorized(request)
      ? "admin_session"
      : null;

  if (!authMode) {
    return NextResponse.json(
      { error: "Unauthorized. Provide admin session or x-makerworks-sync-secret." },
      { status: 401 },
    );
  }

  const limited = await enforceTriggerRateLimit(request, authMode);
  if (limited) {
    return limited;
  }

  await recordRateLimitFailure({
    scope: MAKERWORKS_JOBS_RATE_LIMIT_SCOPE,
    key: buildRateLimitKey(request, authMode),
    windowMs: MAKERWORKS_JOBS_RATE_LIMIT_WINDOW_MS,
  });

  await syncMakerWorksJobs(true);
  return NextResponse.json({
    ok: true,
    message:
      "MakerWorks webhooks are deprecated. OrderWorks syncs directly from MakerWorks DB. Remove webhook delivery to silence this endpoint.",
  });
}
