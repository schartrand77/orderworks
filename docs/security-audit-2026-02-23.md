# Security Audit — 2026-02-23

## Scope
- Static review of API/auth/sync/email/security-header code paths.
- Dependency vulnerability scan via `npm audit --json`.

## Findings

### 1) Critical: vulnerable Next.js runtime version in use
**Severity:** Critical  
**Where:** `package.json` pins `next` to `16.0.3`.  
**Impact:** `npm audit` reports multiple advisories, including a critical RCE advisory affecting current range (`<16.0.7`) and additional high/moderate DoS/source-disclosure advisories affecting `<16.1.5` and `<16.0.11`.  
**Evidence:** `package.json` + `npm audit --json` output.  
**Fix:** Upgrade Next.js to at least `16.1.6` (or latest stable), rebuild, and rerun full regression/security tests.

### 2) High: vulnerable Nodemailer version in use
**Severity:** High  
**Where:** `package.json` uses `nodemailer` `^7.0.10`; `npm audit` reports DoS advisory affecting `<=7.0.10`.  
**Impact:** Crafted addresses can trigger high CPU / recursion behavior in vulnerable parser versions.  
**Fix:** Upgrade Nodemailer to patched version (latest 7.x), run email integration checks.

### 3) High: unauthenticated endpoint can trigger expensive MakerWorks sync
**Severity:** High  
**Where:** `/api/makerworks/jobs` route executes `syncMakerWorksJobs(true)` for `GET`, `POST`, and `HEAD` with no authentication check.  
**Impact:** Any external caller can repeatedly force sync attempts, increasing DB load and enabling application-level DoS/amplification.  
**Fix:**
- Require admin auth (`withAdminApiAuth`) or shared-secret HMAC verification.
- Restrict method to `POST` only.
- Add strict per-IP/per-key rate limiting and bounded concurrency.

### 4) Medium: unauthenticated operational data exposure in health/readiness endpoints
**Severity:** Medium  
**Where:** `/api/ready` and `/api/makerworks/health` are publicly callable and return internal telemetry, source table status, sync metrics, uptime, and raw error messages.  
**Impact:** Provides attackers with internal topology/state and potential error-derived sensitive hints that improve exploitability/recon.
**Fix:**
- Gate detailed payloads behind auth.
- For unauthenticated probes, return minimal boolean health status only.
- Remove raw exception messages from external responses.

### 5) Medium: login rate limiter is process-local and ephemeral
**Severity:** Medium  
**Where:** login route stores attempts in in-memory `Map` (`loginAttemptsByKey`).  
**Impact:** Easy bypass in multi-instance/serverless deployments and after process restart; weakens brute-force protections.  
**Fix:**
- Move rate limiting to shared store (Redis/database) with TTL.
- Optionally add account-wide + IP-wide counters and exponential backoff.

### 6) Medium: missing baseline security response headers
**Severity:** Medium  
**Where:** `next.config.ts` sets headers only for service worker/manifest caching; no CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy defaults are configured at app level.  
**Impact:** Reduced browser-side hardening against XSS/clickjacking/MIME confusion and transport downgrade scenarios (depending on edge/proxy setup).  
**Fix:** Add secure default headers globally (ideally via middleware or Next headers config), including a strict CSP tailored to app needs.

### 7) Medium: CSV import endpoint lacks explicit payload-size guardrails
**Severity:** Medium  
**Where:** `/api/jobs/csv/import` reads full request body/file text into memory and processes rows sequentially without explicit max size / row count limits.  
**Impact:** Large payloads can exhaust memory/CPU and degrade service (application-layer DoS).  
**Fix:**
- Enforce request size caps (body parser / reverse proxy / app-level checks).
- Enforce max row count and per-row length.
- Consider streaming parser + async job queue for large imports.

## Additional hardening recommendations
- Add centralized audit logging destination with retention and alerting.
- Consider short idle session timeout with rotation-on-privileged-action.
- Add dependency scanning in CI (fail build for high/critical in production deps).
- Add SAST and secret scanning in CI.

## Commands run
- `rg --files`
- `rg -n "..." src tests prisma package.json README.md`
- `npm audit --json`
- targeted `sed -n` inspection across auth, API routes, sync, email, and config files.
