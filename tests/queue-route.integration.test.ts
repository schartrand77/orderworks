import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withAdminApiAuthMock = vi.fn();
const recordQueueMutationLatencyMock = vi.fn();

const prismaMock = {
  job: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock("@/lib/auth", () => ({
  withAdminApiAuth: withAdminApiAuthMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/internal-metrics", () => ({
  recordQueueMutationLatency: recordQueueMutationLatencyMock,
}));

describe("queue route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when auth wrapper blocks request", async () => {
    withAdminApiAuthMock.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const { POST } = await import("@/app/api/jobs/[paymentIntentId]/queue/route");
    const request = new NextRequest("http://localhost/api/jobs/pi_1/queue", { method: "POST" });

    const response = await POST(request, {
      params: Promise.resolve({ paymentIntentId: "pi_1" }),
    });

    expect(response.status).toBe(401);
  });

  it("reorders queue and records mutation latency for authorized request", async () => {
    withAdminApiAuthMock.mockImplementation(async (_request: NextRequest, handler: () => Promise<NextResponse>) => {
      return handler();
    });

    prismaMock.job.findUnique
      .mockResolvedValueOnce({ id: "job-2", paymentIntentId: "pi_2", queuePosition: 2 })
      .mockResolvedValueOnce({ id: "job-2", paymentIntentId: "pi_2", queuePosition: 3 });

    prismaMock.job.findMany.mockResolvedValue([
      { id: "job-1", paymentIntentId: "pi_1", queuePosition: 1 },
      { id: "job-2", paymentIntentId: "pi_2", queuePosition: 2 },
      { id: "job-3", paymentIntentId: "pi_3", queuePosition: 3 },
    ]);

    prismaMock.$transaction.mockImplementation(async (callback: (tx: { $executeRaw: () => Promise<number> }) => Promise<void>) => {
      return callback({
        $executeRaw: vi.fn().mockResolvedValue(1),
      });
    });

    const { POST } = await import("@/app/api/jobs/[paymentIntentId]/queue/route");
    const request = new NextRequest("http://localhost/api/jobs/pi_2/queue", {
      method: "POST",
      body: JSON.stringify({ direction: "down" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {
      params: Promise.resolve({ paymentIntentId: "pi_2" }),
    });
    const body = (await response.json()) as { job?: { paymentIntentId: string } };

    expect(response.status).toBe(200);
    expect(body.job?.paymentIntentId).toBe("pi_2");
    expect(recordQueueMutationLatencyMock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid queue mutation payload", async () => {
    withAdminApiAuthMock.mockImplementation(async (_request: NextRequest, handler: () => Promise<NextResponse>) => {
      return handler();
    });

    prismaMock.job.findUnique.mockResolvedValueOnce({ id: "job-1", paymentIntentId: "pi_1", queuePosition: 1 });
    prismaMock.job.findMany.mockResolvedValue([{ id: "job-1", paymentIntentId: "pi_1", queuePosition: 1 }]);
    prismaMock.$transaction.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/jobs/[paymentIntentId]/queue/route");
    const request = new NextRequest("http://localhost/api/jobs/pi_1/queue", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, {
      params: Promise.resolve({ paymentIntentId: "pi_1" }),
    });

    expect(response.status).toBe(422);
  });
});
