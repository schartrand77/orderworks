# Repo/App Audit: Performance, Memory, and Product Enhancements

Date: 2026-02-17  
Scope: `orderworks` app (Next.js + Prisma + Postgres)

## Executive summary

OrderWorks is already clean and functional, but a few architectural patterns currently create avoidable database and rendering cost:

1. **Sync runs on request paths** (dashboard/API/health) which can stack expensive DB work onto user traffic.
2. **Dashboard loads full job payloads without pagination/select narrowing**, including large JSON fields.
3. **Queue reordering performs repeated API calls for drag-and-drop multi-position moves**, increasing write load and UI latency.
4. **Sync path currently executes per-row writes** instead of batched writes.

These are fixable without changing the product experience.

---

## How this audit was performed

- Reviewed sync, job query, and queue flow in server routes/components.
- Reviewed data model/indexes in Prisma schema.
- Reviewed dashboard rendering and client-side reorder logic.
- Looked for hotspots that impact memory pressure, DB round-trips, and user-perceived latency.

---

## Speed enhancements (highest ROI first)

### 1) Move sync off the request hot path

**Current pattern:** `syncMakerWorksJobs()` is called in dashboard page load and several API endpoints.

**Why it hurts:** user-facing requests inherit sync latency and DB variability.

**Recommendation:**
- Run sync in a background cadence (cron / worker / lightweight interval endpoint).
- Keep request-time sync only as fallback (e.g., stale over threshold).
- Return stale-but-recent data quickly and show “last synced X seconds ago”.

**Expected impact:** lower p95 page/API latency and fewer timeout spikes during DB contention.

---

### 2) Add pagination + projection for dashboard lists

**Current pattern:** `findMany` returns full job rows, and server serializes broad payloads into client table.

**Why it hurts:** JSON-heavy columns (`lineItems`, `metadata`, `shipping`) inflate response size and server memory.

**Recommendation:**
- Add cursor pagination (e.g., 50–100 rows/page).
- Use `select` for list endpoints/pages; fetch only columns rendered in table.
- Keep full JSON only on job detail page.

**Expected impact:** substantial reduction in memory, transfer size, and render time on large queues.

---

### 3) Replace stepwise reorder API calls with single “move-to-index” mutation

**Current pattern:** drag-and-drop computes distance and loops N times calling `/queue` with up/down.

**Why it hurts:** O(distance) network + DB writes for one user action.

**Recommendation:**
- Add one endpoint accepting `{ paymentIntentId, targetIndex }`.
- Update queue positions in one transaction using set-based SQL.

**Expected impact:** faster reorder UX, far fewer writes, lower lock contention.

---

### 4) Batch sync writes

**Current pattern:** sync loops through rows and performs per-row update/create.

**Why it hurts:** high DB round-trip overhead during larger deltas.

**Recommendation:**
- Use `createMany` for inserts where possible.
- For updates, batch by chunks and/or use SQL upsert pattern where practical.
- Keep queue assignment deterministic for new records.

**Expected impact:** significantly faster sync for bursts and lower CPU usage.

---

### 5) Add/validate supporting DB indexes for dominant sort/filter patterns

**Current pattern:** single-column indexes exist for status, created-at, queuePosition.

**Recommendation:**
- Add composite indexes aligned to common queries, such as:
  - `(queue_position ASC, makerworks_created_at DESC)`
  - `(makerworks_updated_at DESC)`
  - `(status, makerworks_created_at DESC)` if status-filtered views are common.
- Verify with `EXPLAIN ANALYZE` before/after.

**Expected impact:** lower sort cost and better planner choices at scale.

---

## Memory enhancements

### 1) Don’t hydrate large JSON blobs in list views

- Exclude `lineItems`, `metadata`, `shipping` from dashboard query.
- If an approximate print-time hint is needed, persist a compact derived field (e.g., `estimatedPrintMinutes`) at sync time.

### 2) Reduce duplicated in-memory collections during sync

- Current sync builds arrays/maps/sets (`rows`, `existingIds`) for all changed jobs.
- Process in chunks (e.g., 500 rows) to cap peak memory use.

### 3) Avoid serializing unnecessary fields server→client

- Narrow `SerializedJob` payload for table-only usage.
- Keep detail-only fields in detail route.

### 4) Add payload size guardrails

- For manual job creation/update APIs, enforce practical max JSON/body sizes and reject pathological payloads.

---

## Reliability/observability upgrades (performance-adjacent)

1. Add sync metrics: rows scanned, rows inserted/updated, duration, and error count.
2. Add endpoint-level timing logs for key API routes.
3. Add DB statement timeout for sync and queue writes to avoid long-tail hangs.
4. Add “sync lag” alerting (source latest update vs last successful sync).

---

## Suggested new features (product roadmap)

### Operations features

1. **Saved filter presets** (e.g., “Today + Pending/Printing”).
2. **Bulk actions** (mark selected jobs READY/COMPLETED, send invoices in batch).
3. **SLA aging indicators** (time since created + threshold color coding).
4. **Queue groups by printer/material** for parallel workflow lanes.

### Customer/admin communication

1. **Templated status notifications** (ready for pickup, shipped, delayed).
2. **Email delivery activity timeline** per job (attempts, response codes).
3. **Internal notes history** with audit trail (who changed what/when).

### Throughput planning

1. **Estimated completion forecast** from queue + print-time estimates.
2. **Capacity dashboard** (jobs/day, avg turnaround, overdue count).
3. **“What changed” panel** highlighting newly synced/updated jobs since last shift.

### Integrations

1. **Webhook/event stream out** for StockWorks/other tools (job status + fulfillment changes).
2. **CSV export/import for queue operations**.
3. **Optional barcode/QR scanning** at pickup to mark fulfillment quickly.

---

## Implementation plan (phased)

### Phase 1 (quick wins, low risk)
- Add dashboard pagination + select projection.
- Implement single-call queue move endpoint.
- Add sync and API timing metrics.

### Phase 2 (medium effort)
- Move sync to scheduled/background execution.
- Chunked/batched sync writes.
- Add composite indexes validated with query plans.

### Phase 3 (feature leverage)
- Bulk actions + saved views.
- SLA/capacity analytics.
- Notification templates + audit history.

---

## Success metrics to track

- Dashboard p95 response time.
- Sync duration and rows/sec.
- DB query count per dashboard load.
- Reorder operation latency (drag-drop action to persisted state).
- Process RSS during large sync.

