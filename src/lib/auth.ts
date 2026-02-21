import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "orderworks_admin_session";
export const ADMIN_CSRF_COOKIE = "orderworks_admin_csrf";
export const ADMIN_CSRF_HEADER = "x-csrf-token";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const ADMIN_SESSION_CLOCK_SKEW_SECONDS = 60;
const AUTH_AUDIT_LOG_ENABLED = process.env.AUTH_AUDIT_LOG_ENABLED === "true";

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET?.trim();
if (!ADMIN_SESSION_SECRET) {
  throw new Error("ADMIN_SESSION_SECRET must be configured and non-empty.");
}

function getAdminSessionSecret(): string {
  if (!ADMIN_SESSION_SECRET) {
    throw new Error("ADMIN_SESSION_SECRET must be configured and non-empty.");
  }
  return ADMIN_SESSION_SECRET;
}

interface AdminCredentials {
  username: string;
  password: string;
}

interface AdminSessionPayload {
  iat: number;
  exp: number;
  nonce: string;
  cred: string;
}

type AuthAuditEvent = "login_success" | "login_failure" | "login_rate_limited" | "logout";

function getAdminCredentials(): AdminCredentials | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!username || !password || username.length === 0 || password.length === 0) {
    return null;
  }
  return { username, password };
}

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function unixNowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function createSessionSignature(payloadBase64Url: string) {
  return createHmac("sha256", getAdminSessionSecret()).update(payloadBase64Url).digest("base64url");
}

function createCredentialFingerprint(creds: AdminCredentials) {
  return createHmac("sha256", getAdminSessionSecret())
    .update(`${creds.username}:${creds.password}`)
    .digest("hex");
}

function parseAndValidateSessionToken(token: string): AdminSessionPayload | null {
  const [payloadBase64Url, providedSignature, ...rest] = token.split(".");
  if (!payloadBase64Url || !providedSignature || rest.length > 0) {
    return null;
  }

  const expectedSignature = createSessionSignature(payloadBase64Url);
  if (!safeCompare(expectedSignature, providedSignature)) {
    return null;
  }

  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64Url, "base64url").toString("utf8")) as AdminSessionPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp) ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 8 ||
    typeof payload.cred !== "string" ||
    payload.cred.length < 8
  ) {
    return null;
  }

  const now = unixNowSeconds();
  if (payload.exp <= now || payload.iat > now + ADMIN_SESSION_CLOCK_SKEW_SECONDS) {
    return null;
  }

  return payload;
}

function isStateChangingMethod(method: string) {
  const upperMethod = method.toUpperCase();
  return upperMethod === "POST" || upperMethod === "PUT" || upperMethod === "PATCH" || upperMethod === "DELETE";
}

function isSecureRequest(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    const proto = forwardedProto.split(",")[0]?.trim().toLowerCase();
    if (proto) {
      return proto === "https";
    }
  }
  return request.nextUrl.protocol === "https:";
}

function verifyCsrfToken(request: NextRequest) {
  const csrfCookie = request.cookies.get(ADMIN_CSRF_COOKIE)?.value;
  const csrfHeader = request.headers.get(ADMIN_CSRF_HEADER)?.trim();
  if (!csrfCookie || !csrfHeader) {
    return false;
  }
  return safeCompare(csrfCookie, csrfHeader);
}

function issueSessionCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createAdminSessionToken(),
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
  });
}

function issueCsrfCookie(response: NextResponse, request: NextRequest, token?: string) {
  response.cookies.set({
    name: ADMIN_CSRF_COOKIE,
    value: token ?? createAdminCsrfToken(),
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    httpOnly: false,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
  });
}

export function isAdminAuthConfigured() {
  return getAdminCredentials() !== null;
}

export function verifyAdminCredentials(username: string, password: string) {
  const creds = getAdminCredentials();
  if (!creds) {
    return false;
  }
  return safeCompare(creds.username, username) && safeCompare(creds.password, password);
}

export function createAdminSessionToken() {
  const creds = getAdminCredentials();
  if (!creds) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be configured.");
  }

  const iat = unixNowSeconds();
  const exp = iat + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload: AdminSessionPayload = {
    iat,
    exp,
    nonce: randomBytes(16).toString("hex"),
    cred: createCredentialFingerprint(creds),
  };
  const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createSessionSignature(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
}

export function createAdminCsrfToken() {
  return randomBytes(32).toString("hex");
}

export function validateAdminSessionToken(token?: string) {
  if (!token) {
    return false;
  }
  const creds = getAdminCredentials();
  if (!creds) {
    return false;
  }
  const payload = parseAndValidateSessionToken(token);
  if (!payload) {
    return false;
  }
  return safeCompare(payload.cred, createCredentialFingerprint(creds));
}

export function ensureAdminApiAuth(request: NextRequest) {
  if (!validateAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isStateChangingMethod(request.method) && !verifyCsrfToken(request)) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  return null;
}

export async function withAdminApiAuth(
  request: NextRequest,
  handler: () => Promise<NextResponse> | NextResponse,
) {
  const unauthorized = ensureAdminApiAuth(request);
  if (unauthorized) {
    return unauthorized;
  }

  const response = await handler();
  issueSessionCookie(response, request);
  issueCsrfCookie(response, request, request.cookies.get(ADMIN_CSRF_COOKIE)?.value);
  return response;
}

export function issueAdminAuthCookies(response: NextResponse, request: NextRequest) {
  issueSessionCookie(response, request);
  issueCsrfCookie(response, request);
}

export function clearAdminAuthCookies(response: NextResponse, request: NextRequest) {
  const secure = isSecureRequest(request) || process.env.NODE_ENV === "production";
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  response.cookies.set({
    name: ADMIN_CSRF_COOKIE,
    value: "",
    maxAge: 0,
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

export function getRequestClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

export function logAuthAuditEvent(
  event: AuthAuditEvent,
  request: NextRequest,
  details?: Record<string, string | number | boolean | null>,
) {
  if (!AUTH_AUDIT_LOG_ENABLED) {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    event,
    ip: getRequestClientIp(request),
    path: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent"),
    ...details,
  };
  console.info(`[auth-audit] ${JSON.stringify(entry)}`);
}

export const __authTestUtils = {
  safeCompare,
};

function extractCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }
  const prefix = `${name}=`;
  const cookies = cookieHeader.split(/;\s*/);
  for (const cookie of cookies) {
    if (cookie.startsWith(prefix)) {
      try {
        return decodeURIComponent(cookie.slice(prefix.length));
      } catch {
        return cookie.slice(prefix.length);
      }
    }
  }
  return undefined;
}

export async function readAdminSessionTokenFromHeaders() {
  const headerList = await headers();
  const cookieHeader = headerList.get("cookie");
  return extractCookieValue(cookieHeader, ADMIN_SESSION_COOKIE);
}
