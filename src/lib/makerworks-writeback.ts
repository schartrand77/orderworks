import { Prisma } from "@/generated/prisma/client";
import type { FulfillmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

let jobFormTableExists: boolean | null = null;

async function ensureJobFormTableExists() {
  if (jobFormTableExists !== null) return jobFormTableExists;
  const [result] = await prisma.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'JobForm'
      ) AS "exists"
    `,
  );
  jobFormTableExists = result?.exists ?? false;
  return jobFormTableExists;
}

export async function updateMakerWorksFulfillmentStatus(paymentIntentId: string, status: FulfillmentStatus) {
  if (!paymentIntentId) return 0;
  const exists = await ensureJobFormTableExists();
  if (!exists) return 0;
  const statusValue = String(status).toLowerCase();
  return prisma.$executeRaw(
    Prisma.sql`
      UPDATE public."JobForm"
      SET fulfillment_status = ${statusValue}, "updatedAt" = NOW()
      WHERE "paymentIntentId" = ${paymentIntentId}
    `,
  );
}