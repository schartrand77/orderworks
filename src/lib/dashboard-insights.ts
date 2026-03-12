import { prisma } from "@/lib/prisma";
import { classifyJobExceptions } from "@/lib/job-exceptions";

export interface ExceptionQueueEntry {
  id: string;
  paymentIntentId: string;
  customerEmail: string | null;
  status: string;
  queuePosition: number;
  makerworksCreatedAt: Date;
  issues: ReturnType<typeof classifyJobExceptions>;
}

export interface ShiftHandoffSummary {
  since: Date;
  now: Date;
  newJobs: number;
  completedJobs: number;
  exceptionsSinceShift: number;
}

export async function loadExceptionQueue(limit = 25) {
  const sampleSize = Math.max(limit * 6, 300);
  const rows = await prisma.job.findMany({
    orderBy: [{ queuePosition: "asc" }, { id: "asc" }],
    take: sampleSize,
    select: {
      id: true,
      paymentIntentId: true,
      customerEmail: true,
      status: true,
      queuePosition: true,
      makerworksCreatedAt: true,
      paymentStatus: true,
      metadata: true,
      lineItems: true,
      notes: true,
      receiptSentAt: true,
      updatedAt: true,
    },
  });

  const queue: ExceptionQueueEntry[] = [];
  for (const row of rows) {
    const issues = classifyJobExceptions(row);
    if (issues.length === 0) {
      continue;
    }
    queue.push({
      id: row.id,
      paymentIntentId: row.paymentIntentId,
      customerEmail: row.customerEmail,
      status: row.status,
      queuePosition: row.queuePosition,
      makerworksCreatedAt: row.makerworksCreatedAt,
      issues,
    });
    if (queue.length >= limit) {
      break;
    }
  }

  return queue;
}

export async function loadShiftHandoffSummary(since: Date): Promise<ShiftHandoffSummary> {
  const [newJobs, completedJobs, candidateExceptions] = await Promise.all([
    prisma.job.count({
      where: {
        makerworksCreatedAt: { gte: since },
      },
    }),
    prisma.job.count({
      where: {
        status: "COMPLETED",
        updatedAt: { gte: since },
      },
    }),
    prisma.job.findMany({
      where: {
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        status: true,
        customerEmail: true,
        paymentStatus: true,
        metadata: true,
        lineItems: true,
        notes: true,
        receiptSentAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const exceptionsSinceShift = candidateExceptions.reduce((count, row) => {
    return classifyJobExceptions(row).length > 0 ? count + 1 : count;
  }, 0);

  return {
    since,
    now: new Date(),
    newJobs,
    completedJobs,
    exceptionsSinceShift,
  };
}
