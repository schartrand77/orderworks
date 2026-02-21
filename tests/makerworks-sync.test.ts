import { beforeEach, describe, expect, it, vi } from "vitest";

function buildSourceRow(index: number) {
  return {
    id: `job-${index}`,
    paymentIntentId: `pi-${index}`,
    totalCents: 1000 + index,
    currency: "usd",
    lineItems: [{ description: "item", quantity: 1, unitPriceCents: 1000 + index }],
    shipping: null,
    metadata: null,
    userId: null,
    customerEmail: null,
    paymentMethod: null,
    paymentStatus: null,
    fulfillmentStatus: "pending",
    fulfilledAt: null,
    makerworksCreatedAt: new Date(`2026-01-01T00:00:${String(index % 60).padStart(2, "0")}Z`),
    updatedAt: new Date(`2026-01-02T00:00:${String(index % 60).padStart(2, "0")}Z`),
    status: "pending",
    notes: null,
  };
}

async function loadSyncModule(params: {
  txQueryResults: unknown[];
  existingIds?: string[];
  stateAfterSync?: {
    lastSourceUpdatedAt: Date | null;
    lastSuccessfulSyncAt: Date | null;
    lastSyncDurationMs: number | null;
    lastSyncProcessed: number;
    lastRunMode: string | null;
    lastFullReconcileAt: Date | null;
    lastError: string | null;
    consecutiveFailures: number;
    lastSlowQueryCount: number;
    slowQueryCountTotal: number;
  };
}) {
  vi.resetModules();

  const txQueryRaw = vi.fn();
  for (const value of params.txQueryResults) {
    txQueryRaw.mockResolvedValueOnce(value);
  }

  const tx = {
    $queryRaw: txQueryRaw,
    $executeRaw: vi.fn().mockResolvedValue(1),
    job: {
      findMany: vi.fn().mockResolvedValue((params.existingIds ?? []).map((id) => ({ id }))),
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
  };

  const prismaMock = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([
      {
        singletonKey: "default",
        lastSourceUpdatedAt: params.stateAfterSync?.lastSourceUpdatedAt ?? null,
        lastSuccessfulSyncAt: params.stateAfterSync?.lastSuccessfulSyncAt ?? new Date(),
        lastSyncStartedAt: new Date(),
        lastSyncDurationMs: params.stateAfterSync?.lastSyncDurationMs ?? 10,
        lastSyncProcessed: params.stateAfterSync?.lastSyncProcessed ?? 0,
        lastRunMode: params.stateAfterSync?.lastRunMode ?? "delta",
        lastFullReconcileAt: params.stateAfterSync?.lastFullReconcileAt ?? new Date(),
        lastError: params.stateAfterSync?.lastError ?? null,
        consecutiveFailures: params.stateAfterSync?.consecutiveFailures ?? 0,
        lastSlowQueryCount: params.stateAfterSync?.lastSlowQueryCount ?? 0,
        slowQueryCountTotal: params.stateAfterSync?.slowQueryCountTotal ?? 0,
      },
    ]),
    $transaction: vi.fn(async (callback: (txClient: typeof tx) => Promise<number>) => callback(tx)),
  };

  const getNextQueuePositionMock = vi.fn().mockResolvedValue(100);
  const recordSyncRunMetricsMock = vi.fn().mockResolvedValue(undefined);
  const triggerSummaryRefreshIfStaleMock = vi.fn().mockResolvedValue(false);

  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  vi.doMock("@/lib/job-queue", () => ({ getNextQueuePosition: getNextQueuePositionMock }));
  vi.doMock("@/lib/internal-metrics", () => ({ recordSyncRunMetrics: recordSyncRunMetricsMock }));
  vi.doMock("@/lib/job-maintenance", () => ({ triggerSummaryRefreshIfStale: triggerSummaryRefreshIfStaleMock }));
  vi.doMock("@/lib/observability", () => ({ logStructured: vi.fn() }));

  const mod = await import("@/lib/makerworks-sync");
  return {
    mod,
    tx,
    prismaMock,
    getNextQueuePositionMock,
    recordSyncRunMetricsMock,
  };
}

describe("makerworks sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes insert/update boundaries in one sync run", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => buildSourceRow(index + 1));
    const existingIds = rows.slice(0, 50).map((row) => row.id);

    const { mod, tx, recordSyncRunMetricsMock } = await loadSyncModule({
      txQueryResults: [
        [{ acquired: true }],
        [],
        [{ exists: true }],
        [{ sourceLatest: new Date("2026-01-02T00:59:59Z") }],
        [{ exists: false }],
        [],
        rows,
      ],
      existingIds,
      stateAfterSync: {
        lastSourceUpdatedAt: new Date("2026-01-02T00:59:59Z"),
        lastSuccessfulSyncAt: new Date(),
        lastSyncDurationMs: 100,
        lastSyncProcessed: 101,
        lastRunMode: "full",
        lastFullReconcileAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        lastSlowQueryCount: 0,
        slowQueryCountTotal: 0,
      },
    });

    const processed = await mod.syncMakerWorksJobs(true);

    expect(processed).toBe(101);
    expect(tx.job.update).toHaveBeenCalledTimes(50);
    expect(tx.job.create).toHaveBeenCalledTimes(51);
    expect(recordSyncRunMetricsMock).toHaveBeenCalledTimes(1);
  });

  it("triggerMakerWorksSyncIfStale starts sync and stale check flips after successful sync", async () => {
    const { mod, prismaMock } = await loadSyncModule({
      txQueryResults: [[{ acquired: false }]],
      stateAfterSync: {
        lastSourceUpdatedAt: new Date("2026-01-02T00:00:00Z"),
        lastSuccessfulSyncAt: new Date(),
        lastSyncDurationMs: 5,
        lastSyncProcessed: 0,
        lastRunMode: "delta",
        lastFullReconcileAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        lastSlowQueryCount: 0,
        slowQueryCountTotal: 0,
      },
    });

    expect(mod.isMakerWorksSyncStale()).toBe(true);
    expect(mod.triggerMakerWorksSyncIfStale()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(mod.isMakerWorksSyncStale(60 * 60 * 1000)).toBe(false);
    expect(mod.triggerMakerWorksSyncIfStale(60 * 60 * 1000)).toBe(false);
  });
});
