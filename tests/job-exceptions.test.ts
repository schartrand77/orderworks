import { describe, expect, it } from "vitest";
import { JobStatus as JobStatusEnum } from "@/generated/prisma/enums";
import { classifyJobExceptions } from "@/lib/job-exceptions";

describe("job exception classification", () => {
  it("flags payment mismatch for completed unpaid jobs", () => {
    const issues = classifyJobExceptions({
      status: JobStatusEnum.COMPLETED,
      customerEmail: "customer@example.com",
      paymentStatus: "pending",
      metadata: null,
      lineItems: [],
      notes: null,
      receiptSentAt: null,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    expect(issues).toContain("payment_mismatch");
  });

  it("flags missing model files when none are present", () => {
    const issues = classifyJobExceptions({
      status: JobStatusEnum.PENDING,
      customerEmail: null,
      paymentStatus: null,
      metadata: { foo: "bar" },
      lineItems: [{ sku: "x" }],
      notes: "No url here",
      receiptSentAt: null,
      updatedAt: new Date(),
    });

    expect(issues).toContain("missing_model_files");
  });

  it("flags email notification failures for stale completed jobs without receipt", () => {
    const issues = classifyJobExceptions({
      status: JobStatusEnum.COMPLETED,
      customerEmail: "customer@example.com",
      paymentStatus: "paid",
      metadata: {
        model: {
          url: "https://example.com/part.stl",
        },
      },
      lineItems: [],
      notes: null,
      receiptSentAt: null,
      updatedAt: new Date(Date.now() - 16 * 60 * 1000),
    });

    expect(issues).toContain("failed_email_notifications");
  });
});
