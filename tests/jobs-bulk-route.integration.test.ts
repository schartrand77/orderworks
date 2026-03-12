import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withAdminApiAuthMock = vi.fn();
const sendInvoiceEmailMock = vi.fn();

const prismaMock = {
  job: {
    updateMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/auth", () => ({
  withAdminApiAuth: withAdminApiAuthMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/email", () => ({
  sendInvoiceEmail: sendInvoiceEmailMock,
}));

describe("jobs bulk route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates status in bulk for authorized request", async () => {
    withAdminApiAuthMock.mockImplementation(async (_request: NextRequest, handler: () => Promise<NextResponse>) => {
      return handler();
    });
    prismaMock.job.findMany.mockResolvedValue([]);
    prismaMock.job.updateMany.mockResolvedValue({ count: 2 });

    const { POST } = await import("@/app/api/jobs/bulk/route");
    const request = new NextRequest("http://localhost/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_status",
        paymentIntentIds: ["pi_1", "pi_2"],
        status: "printing",
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { updated?: number };

    expect(response.status).toBe(200);
    expect(body.updated).toBe(2);
    expect(prismaMock.job.updateMany).toHaveBeenCalledTimes(1);
  });

  it("sends invoices in bulk and reports sent/skipped/failed", async () => {
    withAdminApiAuthMock.mockImplementation(async (_request: NextRequest, handler: () => Promise<NextResponse>) => {
      return handler();
    });

    prismaMock.job.findMany.mockResolvedValue([
      {
        paymentIntentId: "pi_send",
        customerEmail: "a@example.com",
        paymentStatus: "pending",
      },
      {
        paymentIntentId: "pi_skip_paid",
        customerEmail: "b@example.com",
        paymentStatus: "paid",
      },
      {
        paymentIntentId: "pi_fail",
        customerEmail: "c@example.com",
        paymentStatus: "pending",
      },
    ]);
    sendInvoiceEmailMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("smtp failed"));
    prismaMock.job.update.mockResolvedValue({});

    const { POST } = await import("@/app/api/jobs/bulk/route");
    const request = new NextRequest("http://localhost/api/jobs/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_invoices",
        paymentIntentIds: ["pi_send", "pi_skip_paid", "pi_fail"],
      }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      sent: number;
      skipped: number;
      failed: Array<{ paymentIntentId: string; error: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]?.paymentIntentId).toBe("pi_fail");
  });
});
