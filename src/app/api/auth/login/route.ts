import { NextRequest, NextResponse } from "next/server";
import {
  assertSafeRequestPayloadSize,
  createPayloadTooLargeResponse,
  createUnsupportedMediaTypeResponse,
  getRequestClientIp,
  issueAdminAuthCookies,
  isJsonRequest,
  isAdminAuthConfigured,
  logAuthAuditEvent,
  verifyAdminCredentials,
} from "@/lib/auth";
import { incrementLoginFailures } from "@/lib/internal-metrics";
import { getRequestId, logStructured } from "@/lib/observability";
import { clearRateLimit, getRateLimitState, recordRateLimitFailure } from "@/lib/request-rate-limit";

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_SCOPE = "auth_login";
const LOGIN_MAX_PAYLOAD_BYTES = 4 * 1024;

function buildRateLimitKey(ip: string, username: string) {
  return `${ip}|${username.trim().toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const startedAt = Date.now();
  const route = "/api/auth/login";

  if (!isAdminAuthConfigured()) {
    const durationMs = Date.now() - startedAt;
    logStructured("error", "admin_login_unconfigured", { requestId, route, durationMs });
    return NextResponse.json(
      { error: "Admin login is not configured on this deployment." },
      { status: 500 },
    );
  }

  if (!isJsonRequest(request)) {
    return createUnsupportedMediaTypeResponse();
  }

  if (!assertSafeRequestPayloadSize(request, LOGIN_MAX_PAYLOAD_BYTES)) {
    return createPayloadTooLargeResponse(LOGIN_MAX_PAYLOAD_BYTES);
  }

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  const password = typeof payload.password === "string" ? payload.password.trim() : "";
  const ip = getRequestClientIp(request);
  const rateLimitKey = buildRateLimitKey(ip, username || "<empty>");
  const rateLimitState = await getRateLimitState({
    scope: LOGIN_RATE_LIMIT_SCOPE,
    key: rateLimitKey,
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    maxAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  });
  if (rateLimitState.limited) {
    await incrementLoginFailures(1);
    logAuthAuditEvent("login_rate_limited", request, { username, retryAfterSeconds: rateLimitState.retryAfterSeconds });
    const durationMs = Date.now() - startedAt;
    logStructured("warn", "admin_login_rate_limited", {
      requestId,
      route,
      durationMs,
      username,
      retryAfterSeconds: rateLimitState.retryAfterSeconds,
    });
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitState.retryAfterSeconds),
        },
      },
    );
  }

  if (!username || !password) {
    await incrementLoginFailures(1);
    await recordRateLimitFailure({
      scope: LOGIN_RATE_LIMIT_SCOPE,
      key: rateLimitKey,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    logAuthAuditEvent("login_failure", request, { username });
    const durationMs = Date.now() - startedAt;
    logStructured("warn", "admin_login_validation_failed", { requestId, route, durationMs, username });
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 422 },
    );
  }

  if (!verifyAdminCredentials(username, password)) {
    await incrementLoginFailures(1);
    await recordRateLimitFailure({
      scope: LOGIN_RATE_LIMIT_SCOPE,
      key: rateLimitKey,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    logAuthAuditEvent("login_failure", request, { username });
    const durationMs = Date.now() - startedAt;
    logStructured("warn", "admin_login_failed", { requestId, route, durationMs, username });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await clearRateLimit(LOGIN_RATE_LIMIT_SCOPE, rateLimitKey);
  logAuthAuditEvent("login_success", request, { username });

  const response = NextResponse.json({ ok: true });
  issueAdminAuthCookies(response, request);
  const durationMs = Date.now() - startedAt;
  logStructured("info", "admin_login_success", { requestId, route, durationMs, username });

  return response;
}
