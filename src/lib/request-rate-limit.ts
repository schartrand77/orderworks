import { createHash } from "crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

interface RateLimitOptions {
  scope: string;
  key: string;
  windowMs: number;
  maxAttempts: number;
}

interface RateLimitState {
  limited: boolean;
  retryAfterSeconds: number;
}

type RateLimitRow = {
  count: number;
  windowStart: Date;
};

const STALE_ENTRY_TTL_MS = 24 * 60 * 60 * 1000;

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

async function ensureRateLimitTable() {
  await prisma.$executeRaw(
    Prisma.sql`
      CREATE TABLE IF NOT EXISTS orderworks."api_rate_limit" (
        "scope" TEXT NOT NULL,
        "key_hash" TEXT NOT NULL,
        "count" INTEGER NOT NULL DEFAULT 0,
        "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("scope", "key_hash")
      )
    `,
  );
}

async function cleanupStaleRows() {
  const cutoff = new Date(Date.now() - STALE_ENTRY_TTL_MS);
  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM orderworks."api_rate_limit"
      WHERE "updated_at" < ${cutoff}
    `,
  );
}

async function readRateLimitRow(scope: string, keyHash: string): Promise<RateLimitRow | null> {
  const rows = await prisma.$queryRaw<RateLimitRow[]>(
    Prisma.sql`
      SELECT "count" AS "count", "window_start" AS "windowStart"
      FROM orderworks."api_rate_limit"
      WHERE "scope" = ${scope}
        AND "key_hash" = ${keyHash}
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

function toRateLimitState(row: RateLimitRow, windowMs: number, maxAttempts: number): RateLimitState {
  const nowMs = Date.now();
  const ageMs = nowMs - row.windowStart.getTime();
  if (ageMs > windowMs) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  if (row.count >= maxAttempts) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - ageMs) / 1000)),
    };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export async function getRateLimitState(options: RateLimitOptions): Promise<RateLimitState> {
  await ensureRateLimitTable();
  if (Math.random() < 0.02) {
    void cleanupStaleRows();
  }
  const keyHash = hashKey(options.key);
  const row = await readRateLimitRow(options.scope, keyHash);
  if (!row) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  const state = toRateLimitState(row, options.windowMs, options.maxAttempts);
  if (!state.limited && state.retryAfterSeconds === 0 && Date.now() - row.windowStart.getTime() > options.windowMs) {
    await clearRateLimit(options.scope, options.key);
  }
  return state;
}

export async function recordRateLimitFailure(options: Pick<RateLimitOptions, "scope" | "key" | "windowMs">) {
  await ensureRateLimitTable();
  const keyHash = hashKey(options.key);
  const now = new Date();
  const resetBefore = new Date(now.getTime() - options.windowMs);

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO orderworks."api_rate_limit" ("scope", "key_hash", "count", "window_start", "updated_at")
      VALUES (${options.scope}, ${keyHash}, 1, ${now}, NOW())
      ON CONFLICT ("scope", "key_hash")
      DO UPDATE SET
        "count" = CASE
          WHEN orderworks."api_rate_limit"."window_start" <= ${resetBefore} THEN 1
          ELSE orderworks."api_rate_limit"."count" + 1
        END,
        "window_start" = CASE
          WHEN orderworks."api_rate_limit"."window_start" <= ${resetBefore} THEN ${now}
          ELSE orderworks."api_rate_limit"."window_start"
        END,
        "updated_at" = NOW()
    `,
  );
}

export async function clearRateLimit(scope: string, key: string) {
  await ensureRateLimitTable();
  const keyHash = hashKey(key);
  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM orderworks."api_rate_limit"
      WHERE "scope" = ${scope}
        AND "key_hash" = ${keyHash}
    `,
  );
}
