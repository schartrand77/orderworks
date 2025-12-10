import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getNextQueuePosition(client: PrismaClient = prisma) {
  const result = await client.job.aggregate({
    _max: { queuePosition: true },
  });
  return (result._max.queuePosition ?? 0) + 1;
}
