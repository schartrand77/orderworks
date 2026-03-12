import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_HEADER,
  clearAdminAuthCookies,
  logAuthAuditEvent,
  validateAdminSessionToken,
} from "@/lib/auth";
import { getRequestId, logStructured } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = getRequestId(request);
  const route = "/api/auth/logout";
  const hasValidSession = validateAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (hasValidSession) {
    const csrfCookie = request.cookies.get(ADMIN_CSRF_COOKIE)?.value;
    const csrfHeader = request.headers.get(ADMIN_CSRF_HEADER)?.trim();
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      const durationMs = Date.now() - startedAt;
      logStructured("warn", "admin_logout_csrf_failed", { requestId, route, durationMs });
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAdminAuthCookies(response, request);
  if (hasValidSession) {
    logAuthAuditEvent("logout", request);
  }
  const durationMs = Date.now() - startedAt;
  logStructured("info", "admin_logout", { requestId, route, durationMs });
  return response;
}
