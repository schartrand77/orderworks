import { NextRequest, NextResponse } from "next/server";
import {
  getRequestClientIp,
  issueAdminAuthCookies,
  isAdminAuthConfigured,
  logAuthAuditEvent,
  verifyAdminCredentials,
} from "@/lib/auth";
import { incrementLoginFailures } from "@/lib/internal-metrics";
import { getRequestId, logStructured } from "@/lib/observability";

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

interface LoginRateLimitEntry {
  attempts: number;
  firstAttemptAtMs: number;
}

const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const loginAttemptsByKey = new Map<string, LoginRateLimitEntry>();

function buildRateLimitKey(ip: string, username: string) {
  return `${ip}|${username.trim().toLowerCase()}`;
}

function getRateLimitState(key: string, nowMs: number) {
  const entry = loginAttemptsByKey.get(key);
  if (!entry) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const ageMs = nowMs - entry.firstAttemptAtMs;
  if (ageMs > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttemptsByKey.delete(key);
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (entry.attempts >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((LOGIN_RATE_LIMIT_WINDOW_MS - ageMs) / 1000));
    return { limited: true, retryAfterSeconds };
  }

  return { limited: false, retryAfterSeconds: 0 };
}

function recordFailedAttempt(key: string, nowMs: number) {
  const existing = loginAttemptsByKey.get(key);
  if (!existing || nowMs - existing.firstAttemptAtMs > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttemptsByKey.set(key, { attempts: 1, firstAttemptAtMs: nowMs });
    return;
  }

  existing.attempts += 1;
  loginAttemptsByKey.set(key, existing);
}

function clearFailedAttempts(key: string) {
  loginAttemptsByKey.delete(key);
}

function cleanupStaleRateLimitEntries(nowMs: number) {
  for (const [key, entry] of loginAttemptsByKey.entries()) {
    if (nowMs - entry.firstAttemptAtMs > LOGIN_RATE_LIMIT_WINDOW_MS) {
      loginAttemptsByKey.delete(key);
    }
  }
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
  const nowMs = Date.now();

  cleanupStaleRateLimitEntries(nowMs);
  const rateLimitState = getRateLimitState(rateLimitKey, nowMs);
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
    recordFailedAttempt(rateLimitKey, nowMs);
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
    recordFailedAttempt(rateLimitKey, nowMs);
    logAuthAuditEvent("login_failure", request, { username });
    const durationMs = Date.now() - startedAt;
    logStructured("warn", "admin_login_failed", { requestId, route, durationMs, username });
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  clearFailedAttempts(rateLimitKey);
  logAuthAuditEvent("login_success", request, { username });

  const response = NextResponse.json({ ok: true });
  issueAdminAuthCookies(response, request);
  const durationMs = Date.now() - startedAt;
  logStructured("info", "admin_login_success", { requestId, route, durationMs, username });

  return response;
}
