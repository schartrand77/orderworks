# Security Audit - 2026-02-23

## Scope
- Static review of API/auth/sync/email/security-header code paths.
- Dependency vulnerability scan via `npm audit --json`.

## Scan Metadata
- Audit date: 2026-02-23
- Audit command: `npm audit --json`
- Saved artifact: `docs/artifacts/security/npm-audit-2026-02-23.json`
- Audit summary from artifact metadata:
- Total vulnerabilities: 33
- Critical: 2
- High: 30
- Moderate: 1
- Note: most findings are dev-dependency and transitive issues; production-priority items in this document focus on direct runtime dependencies and exposed API behavior.

## Findings

### 1) Critical: vulnerable Next.js runtime version in use
**Severity:** Critical  
**Where:** `package.json` pins `next` to `16.0.3`.  
**Impact:** Multiple advisories affect the installed range, including critical remote code execution risk and additional high/moderate denial-of-service and source-disclosure risks.  
**Evidence:**  
- Dependency: `next@16.0.3` in `package.json`.  
- `npm audit --json` (saved artifact) reports `next` as direct vulnerable dependency with `fixAvailable.version` = `16.1.6`.  
- Advisory IDs/links reported by audit:
- `GHSA-9qr9-h5gf-34mp` (critical): https://github.com/advisories/GHSA-9qr9-h5gf-34mp
- `GHSA-h25m-26qc-wcjf` (high): https://github.com/advisories/GHSA-h25m-26qc-wcjf
- `GHSA-mwv6-3258-q52c` (high): https://github.com/advisories/GHSA-mwv6-3258-q52c
- `GHSA-w37m-7fhw-fmv9` (moderate): https://github.com/advisories/GHSA-w37m-7fhw-fmv9
- `GHSA-9g9p-9gw9-jx7f` (moderate): https://github.com/advisories/GHSA-9g9p-9gw9-jx7f
- `GHSA-5f7q-jpqc-wp7h` (moderate): https://github.com/advisories/GHSA-5f7q-jpqc-wp7h
**Fix:** Upgrade Next.js to at least `16.1.6` (or latest stable), rebuild, and rerun regression/security tests.

### 2) High: vulnerable Nodemailer version in use
**Severity:** High  
**Where:** `package.json` uses `nodemailer` `^7.0.10`; audit reports affected range `<=7.0.10`.  
**Impact:** Crafted addresses can trigger high CPU/recursive parser behavior (application-layer DoS).  
**Evidence:**  
- Dependency: `nodemailer@^7.0.10` in `package.json`.  
- Advisory reported by audit: `GHSA-rcmh-qjqh-p98v` (high) https://github.com/advisories/GHSA-rcmh-qjqh-p98v
**Fix:** Upgrade Nodemailer to a patched `7.x` release and run email integration checks.

### 3) High: unauthenticated endpoint can trigger expensive MakerWorks sync
**Severity:** High  
**Where:** `/api/makerworks/jobs` route executes `syncMakerWorksJobs(true)` for `GET`, `POST`, and `HEAD` without authentication.  
**Impact:** Any external caller can trigger forced sync attempts. Existing safeguards reduce parallel blast radius (`pg_try_advisory_xact_lock` and in-flight tracking), but unauthenticated requests can still create repeated database work and sustained load pressure.  
**Fix:**
- Require admin auth (`withAdminApiAuth`) or shared-secret HMAC verification.
- Restrict method to `POST` only.
- Add strict per-IP/per-key rate limiting and bounded concurrency.

### 4) Medium: unauthenticated operational data exposure in health/readiness endpoints
**Severity:** Medium  
**Where:** `/api/ready` and `/api/makerworks/health` are publicly callable and return internal telemetry, source table status, sync metrics, uptime, and raw error messages.  
**Impact:** Exposes internal topology/state and error-derived hints that can improve attacker reconnaissance.  
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
- Optionally add account-wide and IP-wide counters with exponential backoff.

### 6) Medium: missing baseline security response headers
**Severity:** Medium  
**Where:** `next.config.ts` sets headers only for service worker/manifest caching; no CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy defaults at app level.  
**Impact:** Reduced browser-side hardening against XSS, clickjacking, MIME confusion, and downgrade scenarios (depending on edge/proxy configuration).  
**Fix:** Add secure default headers globally (middleware or `next.config.ts` headers), including a strict CSP tailored to app needs.

### 7) Medium: CSV import endpoint lacks explicit payload-size guardrails
**Severity:** Medium  
**Where:** `/api/jobs/csv/import` reads full request body/file text into memory and processes rows sequentially without explicit max size/row-count limits.  
**Impact:** Large payloads can exhaust memory/CPU and degrade service (application-layer DoS).  
**Fix:**
- Enforce request-size caps (body parser, reverse proxy, and app-level checks).
- Enforce max row count and per-row length.
- Consider streaming parser plus async job queue for large imports.

## Additional Hardening Recommendations
- Add centralized audit logging destination with retention and alerting.
- Consider short idle session timeout with rotation on privileged actions.
- Add dependency scanning in CI (fail build for high/critical production vulnerabilities).
- Add SAST and secret scanning in CI.

## Commands Run
- `rg -n "\"next\"|\"nodemailer\"" package.json`
- `rg -n "export async function (GET|POST|HEAD)|syncMakerWorksJobs\\(true\\)" src/app/api/makerworks/jobs/route.ts`
- `rg -n "export async function GET|checks|telemetry|error" src/app/api/ready/route.ts src/app/api/makerworks/health/route.ts`
- `rg -n "loginAttemptsByKey|LOGIN_RATE_LIMIT" src/app/api/auth/login/route.ts`
- `rg -n "request\\.formData\\(|request\\.text\\(|parseCsv\\(" src/app/api/jobs/csv/import/route.ts`
- `rg -n "headers\\(\\)" next.config.ts`
- `npm audit --json > docs/artifacts/security/npm-audit-2026-02-23.json`
