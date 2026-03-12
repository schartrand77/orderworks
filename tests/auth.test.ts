import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importFreshAuthModule() {
  vi.resetModules();
  return import("@/lib/auth");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("auth helpers", () => {
  it("requires ADMIN_SESSION_SECRET at import time", async () => {
    process.env.ADMIN_SESSION_SECRET = "";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password";
    await expect(importFreshAuthModule()).rejects.toThrow("ADMIN_SESSION_SECRET must be configured");
  });

  it("creates and validates signed session tokens", async () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password";
    const auth = await importFreshAuthModule();

    const token = auth.createAdminSessionToken();
    expect(auth.validateAdminSessionToken(token)).toBe(true);
    expect(auth.validateAdminSessionToken(`${token}tampered`)).toBe(false);
  });

  it("safeCompare handles edge cases", async () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password";
    const auth = await importFreshAuthModule();

    expect(auth.__authTestUtils.safeCompare("abc", "abc")).toBe(true);
    expect(auth.__authTestUtils.safeCompare("abc", "abcd")).toBe(false);
    expect(auth.__authTestUtils.safeCompare("abc", "abx")).toBe(false);
    expect(auth.__authTestUtils.safeCompare("", "")).toBe(true);
  });

  it("defaults client IP to unknown unless proxy headers are trusted", async () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password";
    process.env.TRUST_PROXY_HEADERS = "false";
    const auth = await importFreshAuthModule();

    const request = {
      headers: new Headers({ "x-forwarded-for": "203.0.113.1" }),
    } as NextRequest;

    expect(auth.getRequestClientIp(request)).toBe("unknown");
  });

  it("returns validated forwarded IP when proxy headers are trusted", async () => {
    process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "password";
    process.env.TRUST_PROXY_HEADERS = "true";
    const auth = await importFreshAuthModule();

    const request = {
      headers: new Headers({ "x-forwarded-for": "203.0.113.1, 198.51.100.2" }),
    } as NextRequest;

    expect(auth.getRequestClientIp(request)).toBe("203.0.113.1");
    expect(auth.__authTestUtils.isValidIpHeaderValue("127.0.0.1")).toBe(true);
    expect(auth.__authTestUtils.isValidIpHeaderValue("bad actor")).toBe(false);
  });
});
