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
});
