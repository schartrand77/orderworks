# Repo/App Audit: OrderWorks Hardening & Feature Roadmap

Date: 2026-02-21  
Scope: `orderworks` (Next.js App Router + Prisma + Postgres)

## Executive summary

OrderWorks has a solid operational baseline:
- Dashboard list pagination/projection is already implemented.
- MakerWorks sync is chunked and deduplicated with stale-trigger behavior.
- Job queue controls, invoice/receipt flows, and admin-gated API routes are in place.

To further solidify the app for production growth, the highest-impact next steps are:
1. **Harden admin auth/session model** (remove insecure defaults, add rate limiting, and CSRF protections).
2. **Increase reliability around sync concurrency and data edge-cases** (advisory lock + idempotent merge guarantees).
3. **Improve observability** (structured logs/metrics + explicit health/readiness contracts).
4. **Add focused automated tests** for auth, queue mutations, and sync behavior.
5. **Ship operations-oriented features** (saved views, bulk actions, shift summary).

---

## What was reviewed

- App routing and dashboard query flow.
- MakerWorks synchronization logic and telemetry.
- Admin auth/session implementation and protected API patterns.
- Queue mutation APIs and UX implications.
- Existing docs and runtime scripts.

---

## Technical enhancement opportunities

### 1) Authentication and session hardening (highest priority)

**Findings**
- Session token is deterministic from admin credentials + secret, and valid until cookie expiry.
- `ADMIN_SESSION_SECRET` currently has a permissive fallback value.
- Login endpoint has no obvious request throttling.

**Enhancements**
- Require `ADMIN_SESSION_SECRET` explicitly at startup (fail fast if missing).
- Rotate to signed sessions with issuance timestamp and rolling expiration.
- Add rate limiting (IP + username key) to `/api/auth/login`.
- Add CSRF protection for state-changing routes (double-submit cookie or token header).
- Add optional audit log entries for auth success/fail/logout.

**Why this matters**
- Reduces brute-force and replay risk.
- Aligns the app with expected baseline controls for internal operations tooling.

---

### 2) Sync reliability + correctness under concurrency

**Findings**
- Sync currently chunks inserts/updates and tracks telemetry in-memory.
- Sync can be triggered from request paths when stale.

**Enhancements**
- Use Postgres advisory lock to guarantee single sync runner across multi-instance deployments.
- Persist sync checkpoints/telemetry in DB table (not only process memory).
- Add explicit dead-letter/error capture for malformed source rows (with retry policy).
- Add periodic full-reconciliation mode (e.g., nightly) to catch missed deltas.

**Why this matters**
- Prevents race conditions in horizontally scaled hosting.
- Makes sync status visible across restarts and deploys.

---

### 3) Observability and operability

**Findings**
- Console telemetry exists for sync duration/row counts.
- MakerWorks status route provides connection signal.

**Enhancements**
- Adopt structured logging (`requestId`, `route`, `durationMs`, `jobId/paymentIntentId`).
- Add `/api/health` (liveness) and `/api/ready` (DB + source-readiness checks) split.
- Expose minimal internal metrics (sync rows/sec, queue mutation latency, login failures).
- Add alert thresholds: sync lag, consecutive sync failures, and slow query counts.

**Why this matters**
- Faster incident triage and safer on-call support.
- Cleaner separation between “process alive” and “app ready.”

---

### 4) Data lifecycle and performance guardrails

**Enhancements**
- Introduce retention/archive strategy for completed jobs older than N days.
- Add materialized summary table for dashboard counters and aging metrics.
- Add DB constraints for queue-position integrity and status transitions.
- Validate high-value indexes with regular `EXPLAIN ANALYZE` snapshots in docs.

**Why this matters**
- Keeps primary table lean as historical data grows.
- Prevents subtle drift in queue ordering and workflow state.

---

### 5) Automated test coverage and release confidence

**Findings**
- Repository currently exposes lint/build scripts but no dedicated test suite script.

**Enhancements**
- Add unit tests for auth helpers (session token validation, secret requirement, safe compare edge-cases).
- Add integration tests for queue mutation semantics and authorization behavior.
- Add sync tests for insert/update/chunk boundaries and stale-trigger behavior.
- Add a minimal CI workflow: `lint` + `build` + tests on PR.

**Why this matters**
- Prevents regressions in the most business-critical flows.
- Supports faster, safer iteration as features are added.

---

## Product features to solidify daily operations

### Near-term (high utility, moderate scope)
1. **Saved filter views** (per-user or global presets such as “Today/Pending/Printing”).
2. **Bulk actions** (set fulfillment/status, send invoices, mark viewed).
3. **Shift handoff summary** (new jobs, completed jobs, exceptions since last shift).
4. **Exception queue** (payment mismatch, missing model files, failed email notifications).

### Mid-term (throughput + planning)
1. **Capacity forecasting** from print-time estimates + queue shape.
2. **SLA/aging dashboard** with configurable thresholds and breach highlights.
3. **Timeline/audit trail** for job updates (status, notes, invoice, receipt events).

### Longer-term integrations
1. **Outbound webhooks** for StockWorks/other systems on key status transitions.
2. **Barcode/QR pickup workflow** for faster fulfillment confirmation.
3. **CSV export/import utilities** for bulk operational edits.

---

## Suggested phased plan

### Phase 1 (1–2 sprints)
- Enforce required `ADMIN_SESSION_SECRET`.
- Add login rate limiting + CSRF on mutating routes.
- Add structured logging scaffold + request IDs.
- Add initial unit tests for auth and queue APIs.

### Phase 2 (2–3 sprints)
- Advisory-lock sync runner + persisted sync telemetry table.
- Readiness endpoint and alertable sync lag metrics.
- Bulk actions and saved views.

### Phase 3 (ongoing)
- Capacity/SLA analytics.
- Shift summary and event/audit timeline.
- Integration webhooks and operational exports.

---

## Success metrics to track

- Login failure rate + lockout/rate-limit trigger count.
- Dashboard and queue mutation p95 latency.
- Sync lag (`source max updatedAt` vs `last successful sync`).
- Consecutive sync failure count.
- Time-to-resolution for operations incidents.

