import { createHmac, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "orderworks_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

interface AdminCredentials {
  username: string;
  password: string;
}

function getAdminCredentials(): AdminCredentials | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!username || !password || username.length === 0 || password.length === 0) {
    return null;
  }
  return { username, password };
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET?.trim() ?? "orderworks-session-secret";
}

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
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
  const hmac = createHmac("sha256", getSessionSecret());
  hmac.update(`${creds.username}:${creds.password}`);
  return hmac.digest("hex");
}

export function validateAdminSessionToken(token?: string) {
  if (!token) {
    return false;
  }
  const creds = getAdminCredentials();
  if (!creds) {
    return false;
  }
  const expected = createAdminSessionToken();
  return safeCompare(expected, token);
}

export function ensureAdminApiAuth(request: NextRequest) {
  if (validateAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

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
